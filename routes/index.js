module.exports = function (app, addon) {

    // Root route. This route will serve the `atlassian-connect.json` unless the
    // documentation url inside `atlassian-connect.json` is set
    app.get('/', function (req, res) {
        res.format({
            // If the request content-type is text-html, it will decide which to serve up
            'text/html': function () {
                res.redirect('/atlassian-connect.json');
            },
            // This logic is here to make sure that the `atlassian-connect.json` is always
            // served up when requested by the host
            'application/json': function () {
                res.redirect('/atlassian-connect.json');
            }
        });
    });

    // This is the route used to render the dashboard add-on
    // Verify that the incoming request is authenticated with Atlassian Connect
    app.get('/epic-dashboard', addon.authenticate(), function (req, res) {
            // Rendering a template is easy; the `render()` method takes two params: name of template
            // and a json object to pass the context in
            res.render('epic-dashboard', {
                dashboard: req.query['dashboard'],
                dashboardItem: req.query['dashboardItem']
            });
        }
    );

    //
    // don't implement a post route for '/installed' - let the default handler register the new server
    //

    // route to handle getting the callback indicating that the add-on was enabled
    // Verify that the incoming request is authenticated with Atlassian Connect
    app.post('/enabled', addon.authenticate(), function (req, res) {
        // // once the add-on is enabled on a specific JIRA instance, we need to populate the values of our custom field
        // var url = "/rest/api/2/field/ja-report-addon__epic-risk-level-field/option/";
        // var option1 = {"id": 1, "value": "High"};
        // var option2 = {"id": 2, "value": "Medium"};
        // var option3 = {"id": 3, "value": "Low"};
        //
        // var httpClient = addon.httpClient(req);
        //
        // // use put because JIRA has implemented it with an id so that it is both a create and a modify,
        // // whereas post does not specify an id, so it will always append the entry onto the options, even if it's already there
        // // so if you use post, it'll work the first time, but if the addon is ever re-added then it messes things up and JIRA barfs
        // // but using put will create the first time and update the second time and will never create duplicates
        //
        // console.log("Adding Epic Risk Level Option 1 - HIGH");
        // httpClient.put({url: url + "1", json: option1}, function(err, rsp, body) {
        //     if (err) {
        //         console.log("Option 1 Error: " + err);
        //     }
        //     console.log("Option 1 Response: " + rsp.statusCode);
        // });
        //
        // console.log("Adding Epic Risk Level Option 2 - MEDIUM");
        // httpClient.put({url: url + "2", json: option2}, function(err, rsp, body) {
        //     if (err) {
        //         console.log("Option 2 Error: " + err);
        //     }
        //     console.log("Option 2 Response: " + rsp.statusCode);
        // });
        //
        // console.log("Adding Epic Risk Level Option 3 - LOW");
        // httpClient.put({url: url + "3", json: option3}, function(err, rsp, body) {
        //     if (err) {
        //         console.log("Option 3 Error: " + err);
        //     }
        //     console.log("Option 3 Response: " + rsp.statusCode);
        // });

        // done!
        res.sendStatus(200);
    });


  app.get('/wig-dashboard', addon.authenticate(), function(req, res) {
    res.render('wig-dashboard', {
      dashboard: req.query['dashboard'],
      dashboardItem: req.query['dashboardItem']
    });
  });


    // load any additional files you have in routes and apply those to the app
    {
        var fs = require('fs');
        var path = require('path');
        var files = fs.readdirSync("routes");
        for(var index in files) {
            var file = files[index];
            if (file === "index.js") continue;
            // skip non-javascript files
            if (path.extname(file) != ".js") continue;

            var routes = require("./" + path.basename(file));

            if (typeof routes === "function") {
                routes(app, addon);
            }
        }
    }
};
