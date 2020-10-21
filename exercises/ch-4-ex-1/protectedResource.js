var express = require("express");
var bodyParser = require("body-parser");
var cons = require("consolidate");
var nosql = require("nosql").load("database.nosql");
// console.log(nosql.count());

var __ = require("underscore");
var cors = require("cors");

var app = express();

app.use(bodyParser.urlencoded({ extended: true })); // support form-encoded bodies (for bearer tokens)

app.engine("html", cons.underscore);
app.set("view engine", "html");
app.set("views", "files/protectedResource");
app.set("json spaces", 4);

app.use("/", express.static("files/protectedResource"));
app.use(cors());

var resource = {
  name: "Protected Resource",
  description: "This data has been protected by OAuth 2.0",
};

let validateToken = (inToken, nextFunc) => {
  console.log("in validateToken");
  nosql.one(
    (token) => {
      if (token.access_token === inToken) {
        return token;
      }
    },
    (err, token) => {
      if (token) {
        console.log(`found a match: ${inToken}`);
      } else {
        console.log("no matching token found!");
      }
      req.access_token = token;
      nextFunc();
      return;
    }
  );
};

var getAccessToken = function (req, res, next) {
  /*
   * Scan for an access token on the incoming request.
   */
  let inToken;
  let auth = req.headers["authorization"];
  if (auth && auth.toLowerCase().indexOf("bearer") == 0) {
    inToken = auth.slice("bearer ".length);
    // validateToken(inToken, next);
    console.log("in validateToken", nosql.count());
    nosql.one().make((builder) => {
      //console.log("#1: ", token);
      builder.where("access_token", inToken);
      builder.callback((err, tokenRec) => {
        console.log("#2: ", inToken, tokenRec);
        if (tokenRec.access_token === inToken) {
          console.log("match");

          req.access_token = tokenRec.access_token;
          next();
        } else {
          console.log("mismatch");
          res.status(401).end();
        }
      });
    });
    // nosql.one(
    //   function (token) {
    //     console.log("in validateToken 1");

    //     if (token.access_token === inToken) {
    //       return token;
    //     }
    //   },
    //   function (err, token) {
    //     console.log("in validateToken 2");
    //     if (token) {
    //       console.log(`found a match: ${token}`);
    //     } else {
    //       console.log("no matching token found!");
    //     }
    //     req.access_token = token;
    //     next();
    //     return;
    //   }
    // );
  } else if (req.body && req.body.access_token) {
    console.log(
      `todo: find token in the form-encoded parameters in the body: `,
      JSON.stringify(req.body)
    );
  } else if (req.query && req.query.access_token) {
    console.log(
      `todo: find token in the form-encoded parameters in the body: `,
      JSON.stringify(req.query)
    );
  } else {
    console.log("failed, req: ", JSON.stringify(req));
  }
};

app.all("*", getAccessToken);

app.options("/resource", cors());

/*
 * Add the getAccessToken function to this handler
 */
app.post("/resource", cors(), function (req, res) {
  /*
   * Check to see if the access token was found or not
   */
  if (req.access_token) {
    res.json(resource);
  } else {
    res.status(401).end();
  }
});

var server = app.listen(9002, "localhost", function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log("OAuth Resource Server is listening at http://%s:%s", host, port);
});
