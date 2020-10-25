var express = require("express");
var url = require("url");
var bodyParser = require("body-parser");
var randomstring = require("randomstring");
var cons = require("consolidate");
var nosql = require("nosql").load("database.nosql");
var querystring = require("querystring");
var __ = require("underscore");
__.string = require("underscore.string");

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // support form-encoded bodies (for the token endpoint)

app.engine("html", cons.underscore);
app.set("view engine", "html");
app.set("views", "files/authorizationServer");
app.set("json spaces", 4);

// authorization server information
var authServer = {
  authorizationEndpoint: "http://localhost:9001/authorize",
  tokenEndpoint: "http://localhost:9001/token",
};

// client information
var clients = [
  {
    client_id: "oauth-client-1",
    client_secret: "oauth-client-secret-1",
    redirect_uris: ["http://localhost:9000/callback"],
  },

  /*
   * Enter client information here
   */
];

var codes = {};

var requests = {};

var getClient = function (clientId) {
  return __.find(clients, function (client) {
    return client.client_id == clientId;
  });
};

app.get("/", function (req, res) {
  res.render("index", { clients: clients, authServer: authServer });
});

app.get("/authorize", function (req, res) {
  const { client_id, redirect_uri } = req.query;
  const client = getClient(client_id);

  if (!client) {
    res.render("error", { error: "Unknown client" });
    return;
  } else {
    const r = client.redirect_uris.includes(redirect_uri);
    if (!r) {
      console.log("r: ", r);
      res.render("error", {
        error: `Invalid redirect URI (allowed ${client.redirect_uris.join(
          ","
        )}): but got ${redirect_uri}`,
      });
      return;
    }
  }

  let req_id = randomstring.generate(8);
  requests[req_id] = req.query;
  res.render("approve", { client, reqid: req_id });
  /*
   * Process the request, validate the client, and send the user to the approval page
   */
});

app.post("/approve", function (req, res) {
  /*
   * Process the results of the approval page, authorize the client
   */
  const { reqid, approve } = req.body;
  const request = requests[reqid];
  delete request[reqid];

  if (!request) {
    res.render("error", { error: "No matching auth request" });
    return;
  }
  console.log("request: ", JSON.stringify(request));

  if (approve) {
    if (request.response_type === "code") {
      const code = randomstring.generate(8);
      codes[code] = { request };
      const urlRedir = buildUrl(request.redirect_uri, {
        code,
        state: request.state,
      });
      res.redirect(urlRedir);
      return;
    } else {
      const urlResult = buildUrl(request.redirect_uri, {
        error: "unsupported_response_type",
      });
      res.redirect(urlResult);
    }
  } else {
    const urlResult = buildUrl(request.redirect_uri, {
      error: "access_denied",
    });
    res.redirect(urlResult);
    return;
  }
});

app.post("/token", function (req, res) {
  const authHeader = req.headers["authorization"];
  if (authHeader) {
    const clientCred = decodeClientCredentials(authHeader);
    const clientId = clientCred.id;
    const clientSecret = clientCred.secret;

    if (req.body.client_id && clientId) {
      res.status(401).json({
        error:
          "security: client id not supposed to appear both in header and in the form",
      });
      return;
    }

    const client = getClient(clientId);
    if (!client) {
      res.status(401).json({ error: "client not found!" });
      return;
    }

    if (client.client_secret !== clientSecret) {
      res.status(401).json({ error: "client secret error!" });
      return;
    }
    const { code, grant_type } = req.body;
    if (grant_type === "authorization_code") {
      const c = codes[code];
      if (c) {
        delete codes[code];
        if (c.request.client_id === clientId) {
          const access_token = randomstring.generate();
          nosql.insert({ access_token, client_id: clientId });

          const tokenResp = { access_token, token_type: "Bearer" };
          res.status(200).json(tokenResp);
          return;
        } else {
          res.status(400).json({ error: "invalid_grant" });
          return;
        }
      } else {
        res.status(400).json({ error: "error code mismatch" });
        return;
      }
    } else {
      res.status(400).json({ error: "unsupported grant type" });
      return;
    }
  } else {
    res.status(401).json({ error: "authorization header not present" });
    return;
  }
  /*
   * Process the request, issue an access token
   */
});

var buildUrl = function (base, options, hash) {
  var newUrl = url.parse(base, true);
  delete newUrl.search;
  if (!newUrl.query) {
    newUrl.query = {};
  }
  __.each(options, function (value, key, list) {
    newUrl.query[key] = value;
  });
  if (hash) {
    newUrl.hash = hash;
  }

  return url.format(newUrl);
};

var decodeClientCredentials = function (auth) {
  var clientCredentials = Buffer.from(auth.slice("basic ".length), "base64")
    .toString()
    .split(":");
  var clientId = querystring.unescape(clientCredentials[0]);
  var clientSecret = querystring.unescape(clientCredentials[1]);
  return { id: clientId, secret: clientSecret };
};

app.use("/", express.static("files/authorizationServer"));

// clear the database
nosql.clear();

var server = app.listen(9001, "localhost", function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log(
    "OAuth Authorization Server is listening at http://%s:%s",
    host,
    port
  );
});
