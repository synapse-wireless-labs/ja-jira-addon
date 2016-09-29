# Synapse JIRA plugins

A collection of JIRA plugins to make our lives easier.

* Based on altassian-connect-express: https://bitbucket.org/atlassian/atlassian-connect-express
* Hosted on AWS EB: https://ja-report-addon.snapcloud.net/
* Stored in github: https://github.com/synapse-wireless-labs/ja-jira-addon

## Included Add-ons

* [Epic Release Report](#EpicReleaseReport)
* *more to come...*

## <a name="EpicReleaseReport"></a> Epic Release Report

![](https://ja-report-addon.snapcloud.net/Thumbnail.PNG)

* JIRA Dashboard widget
* For the specified Project and Version, this widget will display a bar chart of each Epic's progress, sorted by Rank. (Epic Rank is set by dragging and dropping the Epics on the Epic column of the Board backlog.)
* This add-on adds two new custom fields, Epic Risk Level and Epic Risk Description - you will need to add these fields to the applicable projects and screens.

### To Deploy

``eb deploy`` in the working directory

* You will need to install the AWS EB CLI first: http://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3-install.html
* You will need to setup EB for your project using ``eb init``

### To Develop

Follow these guidelines:

* https://developer.atlassian.com/static/connect/docs/latest/developing/developing-locally.html

You will need to modify the development section of config.json to include your ngrok HTTPS URL.

You may need to install:

* node
* ngrok

Don't forget to install the dependencies (``npm install``) the first time!

To run the app locally, use ``npm start``. Then you will need to use ngrok to make it available on the public internet.

Once it's accessible online, you can add it to your JIRA test instance, and after that you can see it in a JIRA dashboard.

### To Install

As a JIRA administrator, browse to *Gear Icon | Add-ons*, then choose *Manage add-ons* from the left menu. Click the *Upload add-on* link, and enter ``https://ja-report-addon.snapcloud.net/``.

### Things to Remember

* The first time you run the node app, the database will get set up. The first time a JIRA instance connects to your app, the app will store authentication information in the database. If you chance certain things with the atlassian-connect.json file, the database will be out of sync and the app will start returning 400 errors. You will need to clean the database to recover.
* Along the same lines, the first time you connect the JIRA instance to your app, the JIRA instance will need to be entered into the app's database. If you have written a customer /installed handler, your handler must do that correctly. (The default handler does.)

### Potential Enhancements

* Make table sorted (see https://docs.atlassian.com/aui/5.7.1/docs/sortableTable.html)
* Add a key for what the colors mean in the bar chart
* add selector for sort order (currently hard-coded to Rank)
* Add auto-refresh option (partially implemented, need advice from Atlassian)
* Consider changing add-on name to be more descriptive (requires flushing live postgres database, though)

### Known Issues

* Dashboard widget scroll slightly, but only on Windows (only verified in Chrome)

### Atlassian Caveats

* As of September 2016, when searching for JIRA issues according to Story Points value, using ``"Story Points" is empty`` will not find issues that do not allow Story Points to be set.
* As of September 2016, when trying to refresh the add-on's iframe, the auth credentials will expire after 6 minutes. (How to refresh?)