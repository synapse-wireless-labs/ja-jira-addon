require('@atlassian/aui/dist/aui/css/aui.min.css');
require('./addon.css');

const $ = require('jquery');
window.jQuery = $;
window.$ = $;
require('underscore/underscore-min.js');
require('@atlassian/aui/dist/aui/js/aui.min.js');
require('@atlassian/aui/dist/aui/js/aui-datepicker.min.js');

import DashboardItemConfigurationService from './config-service';
import DashboardItemConfigurationView from './config-view';
import IssueTableView from './issue-table-view';

$(document).ready(function () {

  async function onReady () {
    const configService = new DashboardItemConfigurationService();
    AP.require(['jira'], function (jira) {
      jira.DashboardItem.onDashboardItemEdit(async function () {
        const config = await configService.getConfiguration();
        new DashboardItemConfigurationView().render(config);
      });
    });

    const configured = await configService.isConfigured();
    if (configured) {
      const config = await configService.getConfiguration();
      new IssueTableView().render(config);
    } else {
      new DashboardItemConfigurationView().render();
    }
  }

  onReady();
});
