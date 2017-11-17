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
import IssueSearchService from './issue-search-service';

$(document).ready(function () {
  const _loadingTemplate = _.template($('#loadingTemplate').html());
  const _noIssuesTemplate = _.template($('#noIssuesTemplate').html())

  async function onReady () {
    const configService = new DashboardItemConfigurationService();
    AP.require(['jira'], function (jira) {
      jira.DashboardItem.onDashboardItemEdit(async function () {
        const config = await configService.getConfiguration();
        new DashboardItemConfigurationView().render(config);
      });
    });

    const $addon = $('#addon-wrapper');
    $addon.html(_loadingTemplate);

    const configured = await configService.isConfigured();
    if (configured) {
      const config = await configService.getConfiguration();

      AP.jira.setDashboardItemTitle(config.title || 'WIG Dashboard');

      // Get Epics
      const issueService = new IssueSearchService(config);
      const {epics, noEpic} = await issueService.getEpics();

      if (epics.length === 0) {
        $addon.html(_noIssuesTemplate);
      } else {
        new IssueTableView().render(config, epics, noEpic);
      }
    } else {
      new DashboardItemConfigurationView().render();
    }
  }

  onReady();
});
