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
* For the specified Project and Version, this widget will display a bar chart of each Epic's progress, sorted by status and duedate

### To Deploy

``eb deploy`` in the working directory

### To Develop

Follow these guidelines:

* https://developer.atlassian.com/static/connect/docs/latest/developing/developing-locally.html

You will need to modify the development section of config.json to include your ngrok HTTPS URL.

### To Install

As a JIRA administrator, browse to *Gear Icon | Add-ons*, then choose *Manage add-ons* from the left menu. Click the *Upload add-on* link, and enter https://ja-report-addon.snapcloud.net/.

### Things to Remember

* The first time you run the node app, the database will get set up. The first time a JIRA instance connects to your app, the app will store authentication information in the database. If you chance certain things with the atlassian-connect.json file, the database will be out of sync and the app will start returning 400 errors. You will need to clean the database to recover.