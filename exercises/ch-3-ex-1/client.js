var express = require("express");
var request = require("sync-request");
var url = require("url");
var qs = require("qs");
var querystring = require("querystring");
var cons = require("consolidate");
var randomstring = require("randomstring");
var __ = require("underscore");
const e = require("express");
__.string = require("underscore.string");

var app = express();

app.engine("html", cons.underscore);
app.set("view engine", "html");
app.set("views", "files/client");

// authorization server information
var authServer = {
  authorizationEndpoint: "http://localhost:9001/authorize",
  tokenEndpoint: "http://localhost:9001/token",
};

// client information

/*
 * Add the client information in here
 */
var client = {
  client_id: "oauth-client-1",
  client_secret: "oauth-client-secret-1",
  redirect_uris: ["http://localhost:9000/callback"],
};

var protectedResource = "http://localhost:9002/resource";

var state = null;

var access_token = null;
var scope = null;

app.get("/", function (req, res) {
  res.render("index", { access_token: access_token, scope: scope });
});

// const buildUrl = (base, options, hash) => {
//   let newUrl = url.parse(base, true);
//   delete newUrl.search;

//   if (!newUrl.query) {
//     newUrl.query = options;
//   } else {
//     newUrl.query = {
//       ...newUrl.query,
//       ...options,
//     };
//   }

//   if (hash) {
//     newUrl.hash = hash;
//   }

//   let res = url.format(newUrl);
//   console.log("result: ", res, JSON.stringify(newUrl));
//   return res;
// };

app.get("/authorize", function (req, res) {
  /*
   * Send the user to the authorization server
   */
  let redir = buildUrl(authServer.authorizationEndpoint, {
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    state: randomstring.generate(),
  });
  console.log("redir:", redir);
  //res.send(404);
  res.redirect(redir);
});

app.get("/callback", function (req, res) {
  /*
   * Parse the response from the authorization server and get a token
   */
  console.log("in callback: ", JSON.stringify(req.query));

  let form_data = qs.stringify({
    grant_type: "authorization_code",
    code: req.query.code,
    redirect_uri: client.redirect_uris[0],
    state: req.query.state,
  });
  let headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization:
      "Basic " +
      encodeClientCredentials(client.client_id, client.client_secret),
  };
  let tokenRes = request("POST", authServer.tokenEndpoint, {
    body: form_data,
    headers,
  });

  var body = JSON.parse(tokenRes.getBody());

  console.log("tokenRes", JSON.stringify(body));
  access_token = body.access_token;
  res.render("index", { access_token });
  //res.send("todo");
});

app.get("/fetch_resource", function (req, res) {
  /*
   * Use the access token to call the resource server
   */
  if (!access_token) {
    res.render("error", { error: "Missing token" });
    return;
  }

  let headers = {
    Authorization: "Bearer " + access_token,
  };

  let resource = request("POST", protectedResource, { headers });
  if (resource.statusCode >= 200 && resource.statusCode < 300) {
    let body = JSON.parse(resource.getBody());
    res.render("data", { resource: body });
    return;
  } else {
    res.render("error", {
      error: "resource server returned response code: " + resource.statusCode,
    });
    return;
  }
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

var encodeClientCredentials = function (clientId, clientSecret) {
  return Buffer.from(
    querystring.escape(clientId) + ":" + querystring.escape(clientSecret)
  ).toString("base64");
};

app.use("/", express.static("files/client"));

var server = app.listen(9000, "localhost", function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log("OAuth Client is listening at http://%s:%s", host, port);
});
