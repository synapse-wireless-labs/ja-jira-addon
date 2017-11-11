/* add-on script */
$(document).ready(function () {

  const askJIRA = function (url) {
    return new RSVP.Promise((worked, failed) => {
      AP.require(['request'], function (request) {
        request({url: url, success: worked, error: failed});
      });
    });
  };

  const getWigProgress = function (epics) {
    const wig = epics.reduce((acc, epic) => {
      acc.toDo += epic.toDo;
      acc.inProgress += epic.inProgress;
      acc.done += epic.done;
      acc.total += epic.toDo + epic.inProgress + epic.done;
      acc.hasRisks |= (epic.riskLevel || epic.riskDescription);
      acc.hasAlerts |= (epic.notInWigCount > epic.notInWigThreshold);
      return acc;
    }, {toDo: 0, inProgress: 0, done: 0, total: 0, hasRisks: false, hasAlerts: false});

    wig.percentTodo = (wig.total > 0) ? (wig.toDo / wig.total) * 100 : 0;
    wig.percentInProgress = (wig.total > 0) ? (wig.inProgress / wig.total) * 100 : 0;
    wig.percentDone = (wig.total > 0) ? (wig.done / wig.total) * 100 : 0;

    return wig;
  };

  const IssueTableView = function () {
    return {
      setTitle: function (config) {
        AP.require(['jira'], function (jira) {
          jira.setDashboardItemTitle(config ? config.title : 'WIG Dashboard');
        });
      },

      getWigDates: function (config) {
        const MS_PER_DAY = 1000 * 60 * 60 * 24;
        const start = new Date(config.startDate);
        const end = new Date(config.endDate);
        const today = new Date();
        const dates = {
          startDate: start.toDateString(),
          endDate: end.toDateString(),
          totalDays: 0,
          daysPast: 0,
          daysRemaining: 0,
          percentDaysPast: 0,
          percentDaysRemaining: 0
        };

        if (end > start) {
          dates.totalDays = Math.floor((end - start) / MS_PER_DAY) + 1;

          if (today > start) {
            dates.daysPast = Math.ceil((today - start) / MS_PER_DAY);
            dates.percentDaysPast = (dates.daysPast / dates.totalDays) * 100;
          }
          if (end > today) {
            dates.daysRemaining = Math.ceil((end - today) / MS_PER_DAY);
            dates.percentDaysRemaining = (dates.daysRemaining / dates.totalDays) * 100;
          }
        }

        return dates;
      },

      render: function (config) {
        $('#addon-wrapper').empty();

        this.setTitle(config);
        const dates = this.getWigDates(config);

        new IssueSearchService(config).getEpics(function (epics, noEpic) {
          const progress = getWigProgress(epics);
          const hasAlerts = progress.hasAlerts;
          const hasRisks = progress.hasRisks;

          epics.sort(function (a, b) {
            if (a.summary < b.summary)
              return -1;
            if (a.summary > b.summary)
              return 1;
            return 0;
          });

          if (epics.length === 0) {
            $('#addon-wrapper').html(_.template($('#noIssuesTemplate').html())());
          }
          else {
            $('#addon-wrapper').html(_.template($('#addonWrapperTemplate').html())({config: config}));

            const $headerTable = $('#addon-header-table').find('tbody');
            $headerTable.append(_.template($('#addonHeaderDateRowTemplate').html())({dates: dates}));
            $headerTable.prepend(
              _.template($('#addonHeaderOverallRowTemplate').html())({progress: progress, label: config.label}));

            const $epicsInWig = $('#epics-in-wig');
            $epicsInWig.html(_.template($('#epicTableTemplate').html())({hasRisks: hasRisks, hasAlerts: hasAlerts}));

            const $epicTable = $epicsInWig.find('tbody');
            epics.forEach(function (epic) {
              $epicTable.append(_.template($('#epicTableRow').html())(
                {epic: epic, label: config.label, hasRisks: hasRisks, hasAlerts: hasAlerts}));
            });

            if (noEpic.issues.length > 0) {
              const epicKeys = epics.map(function (e) {
                return e.key;
              });
              $epicTable.append(_.template($('#epicTableLastRow').html())({
                noEpic: noEpic,
                epicString: epicKeys.join(','),
                label: config.label,
                hasRisks: progress.hasRisks,
                hasAlerts: progress.hasAlerts
              }));
            }
          }
        });
      }
    };
  };

  const IssueSearchService = function (config) {
    let epics = [];
    let epicKeys = '';
    const noEpic = {};
    let epic_link_id = '';
    let epic_risk_level_id = '';
    let epic_risk_description_id = '';

    function askJIRAforCustomIds () {
      return askJIRA('/rest/api/2/field');
    }

    function processCustomIds (response) {
      const fields = JSON.parse(response) || [];
      fields.forEach(field => {
        if (field.name === 'Epic Link') {
          epic_link_id = field.id;
        }
        else if (field.name === 'Epic Risk Level') {
          epic_risk_level_id = field.id;
        }
        else if (field.name === 'Epic Risk Description') {
          epic_risk_description_id = field.id;
        }
      });
      return RSVP.resolve();
    }

    function askJIRAforEpics () {
      const jql = encodeURIComponent(`labels = "${config.label}" AND issuetype = Epic`);
      return askJIRA(`/rest/api/2/search?jql=${jql}`);
    }

    function processEpics (response) {
      const epicsJson = JSON.parse(response).issues || [];
      epics = epicsJson.map(function (e) {
        e.summary = e.fields.summary;

        switch (e.fields.status.name) {
          case 'Deferred':
            e.statusCategoryName = 'Deferred';
            e.lozengeColorClass = 'aui-lozenge-error';
            break;
          default:
            e.statusCategoryName = e.fields.status.statusCategory.name;
            switch (e.statusCategoryName) {
              case 'To Do':
                e.lozengeColorClass = 'aui-lozenge-complete';
                break;
              case 'In Progress':
                e.lozengeColorClass = 'aui-lozenge-current';
                break;
              case 'Done':
                e.lozengeColorClass = 'aui-lozenge-success';
                break;
              default:
                e.lozengeColorClass = '';
            }
        }

        e.riskLevel = '';
        if (e.fields[epic_risk_level_id]) {
          e.riskLevel = e.fields[epic_risk_level_id].value;
        }
        e.riskDescription = e.fields[epic_risk_description_id] || '';

        switch (e.riskLevel) {
          case 'High':
            e.riskLozengeClass = 'aui-lozenge-error';
            break;
          case 'Medium':
            e.riskLozengeClass = 'aui-lozenge-current';
            break;
          case 'Low':
            e.riskLozengeClass = 'aui-lozenge-success';
            break;
          default:
            e.riskLozengeClass = '';
        }

        if (e.riskDescription && !e.riskLevel) {
          e.riskLevel = 'Note';
        }

        e.issues = [];

        e.notInWigCount = 0;
        e.notInWigThreshold = 0;

        e.toDo = 0;
        e.inProgress = 0;
        e.done = 0;
        e.percentTodo = 0;
        e.percentInProgress = 0;
        e.percentDone = 0;
      });

      epicKeys = epics.map(function (e) {
        return e.key;
      }).join(',');

      return RSVP.resolve();
    }

    function askJIRAforIssuesNotInEpics () {
      if (epics.length === 0) {
        return RSVP.resolve('{}');
      }
      else {
        const jql = encodeURIComponent(
          `labels = "${config.label}" AND issuetype != Epic AND ("Epic Link" is empty or "Epic Link" not in (${epicKeys}))`);
        const fields = encodeURIComponent([epic_link_id, 'status', 'key', 'issuetype'].join(','));
        const maxResults = 500;

        return askJIRA(`/rest/api/2/search?jql=${jql}&fields=${fields}&maxResults=${maxResults}`);
      }
    }

    function processIssuesNotInEpics (response) {
      const issues = JSON.parse(response).issues || [];
      noEpic.issues = issues.map(issue => issue.key);
      noEpic.toDo = issues.filter(issue => issue.fields.status.statusCategory.name === 'To Do').length;
      noEpic.inProgress = issues.filter(issue => issue.fields.status.statusCategory.name === 'In Progress').length;
      noEpic.done = issues.filter(issue => issue.fields.status.statusCategory.name === 'Done').length;

      return RSVP.resolve();
    }

    function askJIRAforUnlabeledIssues () {
      if (epics.length === 0) {
        return RSVP.resolve('{}');
      }
      else {
        const jql = encodeURIComponent(
          `(labels is empty or labels != "${config.label}") AND "Epic Link" in (${epicKeys})`);
        const fields = encodeURIComponent([epic_link_id, 'status', 'key'].join(','));
        const maxResults = 500;

        return askJIRA(`/rest/api/2/search?jql=${jql}&fields=${fields}&maxResults=${maxResults}`);
      }
    }

    function processUnlabeledIssues (response) {
      const issues = JSON.parse(response).issues || [];

      issues.forEach((issue) => {
        const epic = epics.find(e => e.key === issue.fields[epic_link_id]);
        epic.notInWigCount += 1;
      });

      return RSVP.resolve();
    }

    function askJIRAforIssues (startAt, result) {
      if (epics.length === 0) {
        return RSVP.resolve('{}');
      }
      else {
        const jql = encodeURIComponent(`labels = "${config.label}" AND "Epic Link" in (${epicKeys})`);
        const fields = encodeURIComponent([epic_link_id, 'status', 'key', 'issuetype'].join(','));

        return askJIRA(`/rest/api/2/search?jql=${jql}&fields=${fields}&startAt=${startAt || 0}`).
          then(function (rsp) {
            const response = JSON.parse(rsp);
            const next = response.startAt + response.maxResults;
            const totalIssues = result ? result.concat(response.issues) : response.issues;

            return response.total >= next ? askJIRAforIssues(next, totalIssues) : RSVP.resolve(totalIssues);
          });
      }
    }

    function processIssues (issues) {
      issues.forEach(issue => {
        let epic = epics.find(e => e.key === issue.fields[epic_link_id]);

        epic.issues.push(issue.key);

        switch (issue.fields.status.statusCategory.name) {
          case 'To Do':
            epic.toDo += 1;
            break;
          case 'In Progress':
            epic.inProgress += 1;
            break;
          case 'Done':
            epic.done += 1;
            break;
        }
      });

      const scaleRatio = 0.35;
      const maxIssues = [...epics, noEpic].reduce(
        (max, epic) => (epic.issues.length > max) ? epic.issues.length : max, 0);

      [...epics, noEpic].forEach(function (epic) {
        let scaleFactor = 1;
        let divisor = epic.issues.length;

        if (config.scalingEnabled && maxIssues) {
          scaleFactor = (epic.issues.length + (maxIssues - epic.issues.length) *
            scaleRatio) / epic.issues.length;
          divisor = maxIssues;
        }

        epic.percentTodo = divisor ? (epic.toDo / divisor) * 100 * scaleFactor : 0;
        epic.percentInProgress = divisor ? (epic.inProgress / divisor) * 100 * scaleFactor : 0;
        epic.percentDone = divisor ? (epic.done / divisor) * 100 * scaleFactor : 0;
      });

      return RSVP.resolve();
    }

    return {
      getEpics: function (callback) {
        askJIRAforCustomIds().
          then(processCustomIds).
          then(askJIRAforEpics).
          then(processEpics).
          then(askJIRAforIssuesNotInEpics).
          then(processIssuesNotInEpics).
          then(askJIRAforUnlabeledIssues).
          then(processUnlabeledIssues).
          then(askJIRAforIssues).
          then(processIssues).
          then(function () {
            callback(epics, noEpic);
          });
      }
    };
  };

  const DashboardItemConfigurationView = function () {
    const service = new DashboardItemConfigurationService();

    function saveButtonHandler (e) {
      e.preventDefault();

      const config = {
        title: $('#itemTitle').val(),
        label: $('#wigLabel').val(),
        startDate: new Date($('#wigStartDate').val() || 0),
        endDate: new Date($('#wigEndDate').val() || 0),
        scalingEnabled: $('#enableScaling').prop('checked')
      };

      service.save(config, () => new IssueTableView().render(config));
    }

    function cancelButtonHandler (e) {
      e.preventDefault();

      service.getConfiguration(config => new IssueTableView().render(config));
    }

    return {
      render: function (config) {
        const $addon = $('#addon-wrapper');
        $addon.empty();
        $addon.html(_.template($('#addonConfigTemplate').html())(
          {
            title: config ? config.title : 'WIG Status',
            label: config ? config.label : 'WIG',
            startDate: config ? config.startDate : '',
            endDate: config ? config.endDate : ''
          }));

        if (config) {
          $('#enableScaling').prop('checked', config.scalingEnabled);
        }

        $('#saveConfiguration').click(saveButtonHandler);
        $('#cancelConfiguration').click(cancelButtonHandler);
        $('#wigStartDate').datePicker({'overrideBrowserDefault': true});
        $('#wigEndDate').datePicker({'overrideBrowserDefault': true});
      }
    };
  };

  const DashboardItemConfigurationService = function () {
    const $dashboard = $('meta[name=\'dashboard\']').attr('content');
    const $dashboardItem = $('meta[name=\'dashboardItem\']').attr('content');

    function askJIRAforDashboardItemKey () {
      return askJIRA(`/rest/api/2/dashboard/${$dashboard}/items/${$dashboardItem}/properties/itemkey`);
    }

    function askJIRAForDashboardProperties () {
      return askJIRA(`/rest/api/2/dashboard/${$dashboard}/items/${$dashboardItem}/properties`);
    }

    function processDashboardProperties (properties) {
      const configured = _.find(properties.keys, function (property) {
        return 'itemkey' === property.key;
      });

      return RSVP.resolve(configured);
    }

    return {
      getConfiguration: function (callback) {
        askJIRAforDashboardItemKey().then(JSON.parse).then(function (itemkey) {
          callback(itemkey.value);
        });
      },
      isConfigured: function (callback) {
        askJIRAForDashboardProperties().
          then(JSON.parse).
          then(processDashboardProperties).
          then(function (configured) {
            callback(configured);
          });
      },
      save: function (configuration, successCallback) {
        AP.require(['request'], function (request) {
          request({
            url: `/rest/api/2/dashboard/${$dashboard}/items/${$dashboardItem}/properties/itemkey`,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(configuration),
            success: successCallback
          });
        });
      }
    };
  };

  const DashboardItemView = function () {
    return {
      render: function () {
        const service = new DashboardItemConfigurationService();
        service.isConfigured(function (configured) {
          if (configured) {
            service.getConfiguration(config => new IssueTableView().render(config));
          } else {
            new DashboardItemConfigurationView().render();
          }
        });
      }
    };
  };

  AP.require(['jira'], function (jira) {

    jira.DashboardItem.onDashboardItemEdit(function () {
      new DashboardItemConfigurationService().getConfiguration(
        function (config) {
          new DashboardItemConfigurationView().render(config);
        });
    });
  });

  new DashboardItemView().render();
});