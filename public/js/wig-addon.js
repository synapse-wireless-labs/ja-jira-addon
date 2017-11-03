/* add-on script */
$(document).ready(function () {

  var sizeDict = function (d) {
    var c = 0;
    for (var i in d)
      ++c;
    return c;
  };

  var askJIRA = function (url) {
    return new RSVP.Promise(function (worked, failed) {
      AP.require(['request'], function (request) {
        request({
          url: url,
          success: worked,
          error: failed
        });
      });
    });
  };

  var IssueTableView = function () {
    return {
      setTitle: function (config) {
        AP.require(['jira'], function (jira) {
          jira.setDashboardItemTitle(config ? config.title : 'WIG Dashboard');
        });
      },

      getWigDates: function (config) {
        var MS_PER_DAY = 1000 * 60 * 60 * 24;
        var totalDays = 0;
        var daysPast = 0;
        var daysRemaining = 0;
        var percentDaysPast = 0;
        var percentDaysRemaining = 0;
        var today = new Date();

        if (config.endDate > config.startDate) {
          totalDays = Math.floor((config.endDate - config.startDate) / MS_PER_DAY) + 1;

          if (today > config.startDate) {
            daysPast = Math.ceil((today - config.startDate) / MS_PER_DAY);
            percentDaysPast = (daysPast / totalDays) * 100;
          }

          if (config.endDate > today) {
            daysRemaining = Math.ceil((config.endDate - today) / MS_PER_DAY);
            percentDaysRemaining = (daysRemaining / totalDays) * 100;
          }
        }

        return {
          startDate: config.startDate.toDateString(),
          endDate: config.endDate.toDateString(),
          totalDays: totalDays,
          daysPast: daysPast,
          daysRemaining: daysRemaining,
          percentDaysPast: percentDaysPast,
          percentDaysRemaining: percentDaysRemaining
        };
      },

      getWigProgress: function (epics) {
        var hasRisks = false;
        var hasAlerts = false;
        var toDoIssues = 0;
        var percentTodo = 0;
        var inProgressIssues = 0;
        var percentInProgress = 0;
        var doneIssues = 0;
        var percentDone = 0;

        $.each(epics, function (i, $epic) {
          toDoIssues += $epic.toDoIssues;
          inProgressIssues += $epic.inProgressIssues;
          doneIssues += $epic.doneIssues;

          if ($epic.riskLevel || $epic.riskDescription) {
            hasRisks = true;
          }

          if ($epic.notInReleaseCount > $epic.notInReleaseThreshold) {
            hasAlerts = true;
          }
        });

        var totalIssues = toDoIssues + inProgressIssues + doneIssues;
        if (totalIssues > 0) {
          percentTodo = (toDoIssues / totalIssues) * 100;
          percentInProgress = (inProgressIssues / totalIssues) * 100;
          percentDone = (doneIssues / totalIssues) * 100;
        }

        return {
          toDo: toDoIssues,
          inProgress: inProgressIssues,
          done: doneIssues,
          total: totalIssues,
          percentTodo: percentTodo,
          percentInProgress: percentInProgress,
          percentDone: percentDone,
          hasRisks: hasRisks,
          hasAlerts: hasAlerts
        };

      },

      render: function (config) {
        $('#addon-wrapper').empty();

        this.setTitle(config);
        var dates = this.getWigDates(config);

        new IssueSearchService(config).getEpics(function (epics) {
          var progress = this.getWigProgress(epics);
          var hasAlerts = progress.hasAlerts;
          var hasRisks = progress.hasRisks;

          if (sizeDict(epics) === 0) {
            $('#addon-wrapper').html(_.template($('#noIssuesTemplate').html())());
          }
          else {
            $('#addon-wrapper').html(_.template($('#addonWrapperTemplate').html())({config: config}));

            var tbody = $('#addon-header-table').find('tbody');
            tbody.append(_.template($('#addonHeaderDateRowTemplate').html())({dates: dates}));
            tbody.prepend(
              _.template($('#addonHeaderOverallRowTemplate').html())({progress: progress, label: config.label}));

            var $epicsInWig = $('#epics-in-wig');
            $epicsInWig.html(_.template($('#epicTableTemplate').html())({hasRisks: hasRisks, hasAlerts: hasAlerts}));

            var epicTable = $epicsInWig.find('tbody');
            $.each(epics, function (i, epic) {
              if (epic.key !== 'NO_EPIC') {
                epicTable.append(_.template($('#epicTableRow').html())(
                  {epic: epic, label: config.label, hasRisks: hasRisks, hasAlerts: hasAlerts}));
              }
            });

            if (epics['NO_EPIC'].issueCount) {
              var epicKeys = [];
              $.each(epics, function (i, epic) {
                if (epic.key !== 'NO_EPIC') {
                  epicKeys.push(epic.key);
                }
              });
              epicTable.append(_.template($('#epicTableLastRow').html())({
                issues: epics['NO_EPIC'],
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

  var IssueSearchService = function (config) {
    var epics = {};
    var issuesNotInEpics = {};
    var epic_link_id = '';
    var epic_risk_level_id = '';
    var epic_risk_description_id = '';

    function askJIRAforCustomIds () {
      return askJIRA('/rest/api/2/field');
    }

    function processCustomIds (response) {
      var fields = JSON.parse(response) || [];
      $.each(fields, function (i, field) {
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
      var jqlString = 'labels = ' + config.label + ' AND issuetype = Epic ORDER BY ' + sortFieldName + ' ' + sortOrder;
      var jql = encodeURIComponent(jqlString);
      return askJIRA('/rest/api/2/search?jql=' + jql);
    }

    function processEpics (response) {
      var epicsJson = JSON.parse(response).issues || [];
      $.each(epicsJson, function (i, e) {
        epics[e.key] = e;

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
        e.issueCount = 0;

        e.notInWigCount = 0;
        e.notInWigThreshold = 0;

        e.toDo = 0;
        e.inProgress = 0;
        e.done = 0;
        e.percentTodo = 0;
        e.percentInProgress = 0;
        e.percentDone = 0;

      });
      return RSVP.resolve();
    }

    function askJIRAforIssuesNotInEpics () {
      if (sizeDict(epics) === 0) {
        return RSVP.resolve('{}');
      }
      else {
        var epicKeys = [];
        $.each(epics, function (i, epic) {
          epicKeys.push(epic.key);
        });

        var jql = encodeURIComponent('labels = ' + config.label +
          ' AND issuetype != Epic AND ("Epic Link" is empty or "Epic Link" not in (' +
          epicKeys.join(',') + '))');
        var fields = encodeURIComponent([epic_link_id, 'status', 'key', 'issuetype'].join(','));
        var maxResults = 500;

        return askJIRA('/rest/api/2/search?jql=' + jql + '&fields=' + fields + '&maxResults=' + maxResults);
      }
    }

    function processIssuesNotInEpics (response) {
      var issues = JSON.parse(response).issues || [];

      issuesNotInEpics.key = 'NO_EPIC';
      issuesNotInEpics.summary = 'Issues without an Epic';
      issuesNotInEpics.lozengeColorClass = '';
      issuesNotInEpics.statusCategoryName = 'Unknown';
      issuesNotInEpics.riskLevel = '';
      issuesNotInEpics.riskDescription = '';
      issuesNotInEpics.riskLozengeClass = 'aui-lozenge-default';

      issuesNotInEpics.issues = [];
      issuesNotInEpics.issueCount = 0;
      issuesNotInEpics.notInWigCount = 0;
      issuesNotInEpics.toDo = 0;
      issuesNotInEpics.inProgress = 0;
      issuesNotInEpics.done = 0;
      issuesNotInEpics.percentTodo = 0;
      issuesNotInEpics.percentInProgress = 0;
      issuesNotInEpics.percentDone = 0;

      $.each(issues, function (i, issue) {
        issuesNotInEpics.issues.push(issue.key);
        issuesNotInEpics.issueCount += 1;

        switch (issue.fields.status.statusCategory.name) {
          case 'To Do':
            issuesNotInEpics.toDo += 1;
            break;
          case 'In Progress':
            issuesNotInEpics.inProgress += 1;
            break;
          case 'Done':
            issuesNotInEpics.done += 1;
            break;
        }
      });

      return RSVP.resolve();
    }

    function askJIRAforUnlabeledIssues () {
      if (sizeDict(epics) === 0) {
        return RSVP.resolve('{}');
      }
      else {
        var epicKeys = [];
        $.each(epics, function (i, epic) {
          epicKeys.push(epic.key);
        });

        var jql = encodeURIComponent('(labels is empty or labels != ' + config.label + ') AND "Epic Link" in (' +
          epicKeys.join(',') + ')');
        var fields = encodeURIComponent([epic_link_id, 'status', 'key'].join(','));
        var maxResults = 500;

        return askJIRA('/rest/api/2/search?jql=' + jql + '&fields=' + fields + '&maxResults=' + maxResults);
      }
    }

    function processUnlabeledIssues (response) {
      var issues = JSON.parse(response).issues || [];

      $.each(issues, function (i, issue) {
        var epic = epics[issue.fields[epic_link_id]];
        epic.notInWigCount += 1;
      });

      return RSVP.resolve();
    }

    function askJIRAforIssues (startAt, result) {
      if (sizeDict(epics) === 0) {
        return RSVP.resolve('{}');
      }
      else {
        var epicKeys = [];
        $.each(epics, function (i, epic) {
          epicKeys.push(epic.key);
        });

        var jql = encodeURIComponent('labels = ' + config.label + ' AND "Epic Link" in (' + epicKeys.join(',') + ')');
        var fields = encodeURIComponent([epic_link_id, 'status', 'key', 'issuetype'].join(','));

        return askJIRA('/rest/api/2/search?jql=' + jql + '&fields=' + fields + '&startAt=' + (startAt || 0)).
          then(function (rsp) {
            var response = JSON.parse(rsp);
            var next = response.startAt + response.maxResults;
            var totalIssues = result ? result.concat(response.issues) : response.issues;

            return response.total >= next ? askJIRAforIssues(next, totalIssues) : RSVP.resolve(totalIssues);
          });
      }
    }

    function processIssues (issues) {
      $.each(issues, function (i, issue) {
        var epic = epics[issue.fields[epic_link_id]];
        epic.issues.push(issue.key);
        epic.issueCount += 1;

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

      if (sizeDict(epics) > 0) {
        epics['NO_EPIC'] = issuesNotInEpics;
      }

      $.each(epics, function (i, epic) {
        var scaleFactor = 1;
        var divisor = epic.issueCount;

        if (scaling) {
          var maxIssues = 0;
          $.each(epics, function (i, epic) {
            if (epic.issueCount > maxIssues) {
              maxIssues = epic.issueCount;
            }

          });
          if (maxIssues) {
            var scaleRatio = 0.35;
            scaleFactor = (epic.issueCount + (maxIssues - epic.issueCount) *
              scaleRatio) / epic.issueCount;
            divisor = maxIssues;
          }
        }

        if (divisor) {
          epic.percentTodo = (epic.toDo / divisor) * 100 * scaleFactor;
          epic.percentInProgress = (epic.inProgress / divisor) * 100 * scaleFactor;
          epic.percentDone = (epic.done / divisor) * 100 * scaleFactor;
        }
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
            callback(epics);
          });

      }
    };
  };

  var DashboardItemConfigurationView = function () {
    var service = new DashboardItemConfigurationService();

    function saveButtonHandler (e) {
      e.preventDefault();
      var title = $('#itemTitle').val();

      var wigLabel = $('#wigLabel').val();

      var startDateStr = $('#wigStartDate').val();
      var wigStartDate = new Date(startDateStr || 0);

      var endDateStr = $('#wigEndDate').val();
      var wigEndDate = new Date(endDateStr || 0);

      var $selectedField = $('#selectedField').find(':selected');
      var sortFieldKey = $selectedField.val();
      var sortFieldName = $selectedField.text();

      var $sortOrder = $('#sortOrder').find(':selected');
      var sortOrder = $sortOrder.val();

      var scalingEnabled = $('#enableScaling').prop('checked');

      var refreshEnabled = $('#enableRefresh').prop('checked');

      var configuration = {
        title: title,
        label: wigLabel,
        startDate: wigStartDate,
        endDate: wigEndDate,
        sortFieldKey: sortFieldKey,
        sortFieldName: sortFieldName,
        sortOrder: sortOrder,
        scalingEnabled: scalingEnabled,
        refreshEnabled: refreshEnabled
      };

      service.save(configuration, function () {
        new IssueTableView().render(configuration);
      });
    }

    function cancelButtonHandler (e) {
      e.preventDefault();
      service.getConfiguration(function (config) {
        new IssueTableView().render(config);
      });
    }

    return {
      render: function (config) {
        var $addon = $('#addon-wrapper');
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

  var DashboardItemConfigurationService = function () {
    var $dashboard = $('meta[name=\'dashboard\']').attr('content');
    var $dashboardItem = $('meta[name=\'dashboardItem\']').attr('content');

    function askJIRAforDashboardItemKey () {
      return askJIRA('/rest/api/2/dashboard/' + $dashboard + '/items/' + $dashboardItem + '/properties/itemkey');
    }

    function askJIRAForDashboardProperties () {
      return askJIRA('/rest/api/2/dashboard/' + $dashboard + '/items/' + $dashboardItem + '/properties');
    }

    function processDashboardProperties (properties) {
      var configured = _.find(properties.keys, function (property) {
        return 'itemkey' === property.key;
      });

      return RSVP.resolve(configured);
    }

    return {
      getConfiguration: function (callback) {
        askJIRAforDashboardItemKey().then(JSON.parse).then(function (itemkey) {
          console.log('Item Key: ' + itemkey.value);
          callback(itemkey.value);
        });
      },
      isConfigured: function (callback) {
        askJIRAForDashboardProperties().
          then(JSON.parse).
          then(processDashboardProperties).
          then(function (configured) {
            console.log('isConfigured: ' + configured);
            callback(configured);
          });
      },
      save: function (configuration, successCallback) {
        AP.require(['request'], function (request) {
          request({
            url: '/rest/api/2/dashboard/' + $dashboard + '/items/' + $dashboardItem + '/properties/itemkey',
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(configuration),
            success: successCallback
          });
        });
      }
    };
  };

  var DashboardItemView = function () {
    return {
      render: function () {
        var service = new DashboardItemConfigurationService();
        service.isConfigured(function (configured) {
          if (configured) {
            service.getConfiguration(function (config) {
              new IssueTableView().render(config);
            });
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