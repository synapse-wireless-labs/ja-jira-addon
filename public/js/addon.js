/* add-on script */
$( document ).ready(function() {

    var sizeDict = function (d) {
        c=0;
        for (i in d)
            ++c;
        return c
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
                if (config) {
                    AP.require(['jira'], function (jira) {
                        jira.setDashboardItemTitle(config.title);
                    });
                } else {
                    AP.require(['jira'], function (jira) {
                        jira.setDashboardItemTitle('Issues in project');
                    });
                }
            },

            render: function (configuration) {
                this.setTitle(configuration);


                var $addon = $('#addon-wrapper');
                $addon.empty();
                $addon.html(_.template($('#addonWrapperTemplate').html())({config: configuration}));

                var releaseInfo = {};
                releaseInfo.projectName = configuration.projectName;
                releaseInfo.versionName = configuration.versionName;

                releaseInfo.totalDays = 0;
                releaseInfo.daysPast = 0;
                releaseInfo.daysRemaining = 0;
                releaseInfo.percentDaysPast = 0;
                releaseInfo.percentDaysRemaining = 0;

                releaseInfo.toDoPoints = 0;
                releaseInfo.inProgressPoints = 0;
                releaseInfo.donePoints = 0;
                releaseInfo.percentTodo = 0;
                releaseInfo.percentInProgress = 0;
                releaseInfo.percentDone = 0;

                new IssueSearchService(configuration.project, configuration.version)
                    .getReleaseDates(function (startDate, endDate) {
                        epoch = new Date(0);
                        releaseInfo.startDate = "dates";
                        if (startDate > epoch) {
                            releaseInfo.startDate = startDate.toDateString();
                        }
                        releaseInfo.endDate = "unknown";
                        if (endDate > epoch) {
                            releaseInfo.endDate = endDate.toDateString();
                        }

                        msPerDay = 1000 * 60 * 60 * 24;
                        today = new Date();

                        if (endDate > startDate) {
                            releaseInfo.totalDays = Math.floor((endDate - startDate) / msPerDay) + 1;
                        }
                        if (today > startDate) {
                            releaseInfo.daysPast = Math.ceil((today - startDate) / msPerDay);
                        }
                        if (endDate > today) {
                            releaseInfo.daysRemaining = Math.ceil((endDate - today) / msPerDay);
                        }
                        if (releaseInfo.totalDays > 0) {
                            releaseInfo.percentDaysPast = (releaseInfo.daysPast / releaseInfo.totalDays) * 100;
                            releaseInfo.percentDaysRemaining = (releaseInfo.daysRemaining / releaseInfo.totalDays) * 100;
                        }

                        $('#addon-header-table').find('tbody').append(_.template($('#addonHeaderDateRowTemplate').html())({release: releaseInfo}));
                    });

                new IssueSearchService(configuration.project, configuration.version)
                        .getEpics(function (epics) {
                            var $epicsInRelease = $('#epics-in-release');
                            if (sizeDict(epics) == 0) {
                                 $epicsInRelease.html(_.template($('#noIssuesTemplate').html())({config: configuration}));
                             }
                             else {
                                $.each(epics, function (i, $epic) {
                                    releaseInfo.toDoPoints += $epic.toDoPoints;
                                    releaseInfo.inProgressPoints += $epic.inProgressPoints;
                                    releaseInfo.donePoints += $epic.donePoints;
                                });

                                releaseInfo.totalPoints = releaseInfo.toDoPoints + releaseInfo.inProgressPoints + releaseInfo.donePoints;

                                if (releaseInfo.totalPoints > 0) {
                                    releaseInfo.percentTodo = (releaseInfo.toDoPoints / releaseInfo.totalPoints) * 100;
                                    releaseInfo.percentInProgress = (releaseInfo.inProgressPoints / releaseInfo.totalPoints) * 100;
                                    releaseInfo.percentDone = (releaseInfo.donePoints / releaseInfo.totalPoints) * 100;
                                }

                                $('#addon-header-table').find('tbody').prepend(_.template($('#addonHeaderOverallRowTemplate').html())({release: releaseInfo}));
                                $epicsInRelease.html(_.template($('#epicTableTemplate').html())({}));

                                var epicTable = $epicsInRelease.find('tbody');
                                $.each(epics, function (i, $epic) {
                                    epicTable.append(_.template($('#epicTableRow').html())({epic: $epic}));
                                });

                            }
                        })
                }
            }
    };

    var IssueSearchService = function (project, version) {
        var releaseStartDate = new Date(0);
        var releaseEndDate = new Date(0);
        var epics = {};
        var story_points_id = "";
        var epic_link_id = "";

        function askJIRAforEpics() {
            var jql = encodeURIComponent('project = ' + project + ' AND fixVersion = ' + version + ' AND issuetype = Epic ORDER BY status, duedate');
            return askJIRA('/rest/api/2/search?jql=' + jql);
        }

        function processEpics(response) {
            var epicsJson = JSON.parse(response).issues;
            $.each(epicsJson, function (i, e) {
                epics[e.key] = e;

                e.lozengeColorClass = "";
                switch (e.fields.status.statusCategory.name) {
                    case "To Do":
                        e.lozengeColorClass = "aui-lozenge-complete";
                        break;
                    case "In Progress":
                        e.lozengeColorClass = "aui-lozenge-current";
                        break;
                    case "Done":
                        e.lozengeColorClass = "aui-lozenge-success";
                        break;
                }

                e.stories = [];
                e.storyCount = 0;
                e.estimatedStoryCount = 0;
                e.unestimatedStoryCount = 0;
                e.percentUnestimatedStories = 0;
                e.totalPoints = 0;
                e.toDoPoints = 0;
                e.inProgressPoints = 0;
                e.donePoints = 0;
                e.percentTodo = 0;
                e.percentInProgress = 0;
                e.percentDone = 0;

            });
            RSVP.resolve();
        }

        function askJIRAforReleaseDates() {
            return askJIRA('/rest/api/2/project/' + project + '/versions');
        }

        function processReleaseDates(response) {
            var versions = JSON.parse(response);
            $.each(versions, function (i, v) {
                if (v.id == version) {
                    releaseStartDate = new Date(v.userStartDate || 0);
                    releaseEndDate = new Date(v.userReleaseDate || 0);
                }
            });
            RSVP.resolve();
        }

        function askJIRAforCustomIds () {
            return askJIRA('/rest/api/2/field');
        }

        function processCustomIds(response) {
            var fields = JSON.parse(response);
            $.each(fields, function (i, field) {
                if (field.name == "Story Points") {
                    story_points_id = field.id;
                } else if (field.name == "Epic Link") {
                    epic_link_id = field.id;
                }
            });
            RSVP.resolve();
        }

        function askJIRAforIssues() {
            if (sizeDict(epics) == 0) {
                RSVP.resolve({});
            }
            else {
                var epicKeys = [];
                $.each(epics, function (i, epic) {
                    epicKeys.push(epic.key);
                });

                var jql = encodeURIComponent('project = ' + project + ' AND fixVersion = ' + version + ' AND "Epic Link" in (' + epicKeys.join(',') + ')');
                var fields = encodeURIComponent([epic_link_id, story_points_id, 'status', 'key'].join(','));
                var maxResults = 500;

                return askJIRA('/rest/api/2/search?jql=' + jql + '&fields=' + fields + '&maxResults=' + maxResults);
            }
        }

        function processIssues (response) {
            var issues = JSON.parse(response).issues;

            $.each(issues, function (i, issue) {
                epic = epics[issue.fields[epic_link_id]];
                epic.stories.push(issue.key);
                epic.storyCount += 1;

                story_points = issue.fields[story_points_id];
                if (story_points) {
                    epic.estimatedStoryCount += 1;
                    epic.totalPoints += story_points;

                    switch (issue.fields.status.statusCategory.name) {
                        case "To Do":
                            epic.toDoPoints += story_points;
                            break;
                        case "In Progress":
                            epic.inProgressPoints += story_points;
                            break;
                        case "Done":
                            epic.donePoints += story_points;
                            break;
                    }
                }
            });

            $.each(epics, function (i, epic) {
                epic.percentTodo = (epic.toDoPoints / epic.totalPoints) * 100;
                epic.percentInProgress = (epic.inProgressPoints / epic.totalPoints) * 100;
                epic.percentDone = (epic.donePoints / epic.totalPoints) * 100;
                epic.unestimatedStoryCount = epic.storyCount - epic.estimatedStoryCount;
                epic.percentUnestimatedStories = Math.floor((epic.unestimatedStoryCount / epic.storyCount) * 100);
            });

        }

        return {
            getReleaseDates: function(callback) {
                askJIRAforReleaseDates()
                    .then(processReleaseDates)
                    .then(function (){
                        callback(releaseStartDate, releaseEndDate);
                    });
            },
            getEpics: function (callback) {
                askJIRAforEpics()
                    .then(processEpics)
                    .then(askJIRAforCustomIds)
                    .then(processCustomIds)
                    .then(askJIRAforIssues)
                    .then(processIssues)
                    .then(function () {
                        callback(epics);
                    });

            }
        }
    };

    var DashboardItemConfigurationView = function () {
        return {
            addProjects: function (config, addVersions) {
                AP.require(['request'], function (request) {
                    request({
                        url: '/rest/api/2/project',
                        success: function (response) {
                            var projects = JSON.parse(response);
                            var $selectedProject = $('#selectedProject');
                            $.each(projects, function (index, project) {
                                var select = $('<option>', {value: project.id}).text(project.name);
                                if (config && config.project == project.id) {
                                    $selectedProject.append(select.attr('selected', 'selected'));
                                }
                                $selectedProject.append(select);
                            });
                            addVersions(config)
                        }
                    });
                });

            },
            addVersions: function (config) {
                var currentProject = $('#selectedProject').find(':selected').val();
                AP.require(['request'], function (request) {
                    request({
                        url: '/rest/api/2/project/' + currentProject,
                        success: function (response) {
                            var $selectedVersion = $('#selectedVersion');
                            $selectedVersion.empty();
                            var versions = JSON.parse(response).versions;
                            $.each(versions, function (index, version) {
                                var versionOption = $('<option>', {value: version.id}).text(version.name);
                                if (config && config.version == version.id) {
                                    $selectedVersion.append(versionOption.attr('selected', 'selected'));
                                }
                                $selectedVersion.append(versionOption);
                            });
                        }
                    })
                });
            },
            render: function (config) {
                var $addon = $('#addon-wrapper');
                $addon.empty();
                $addon.html(_.template($('#addonConfigTemplate').html())({itemTitle: config.title || 'Issues for project'}));

                this.addProjects(config, this.addVersions);

                $('#selectedProject').change(config, this.addVersions);

                $('#saveConfiguration').click(function (e) {
                    e.preventDefault();
                    var service = new DashboardItemConfigurationService();
                    var title = $('#itemTitle').val();

                    var $selectedProject = $('#selectedProject').find(':selected');
                    var projectId = $selectedProject.val();
                    var projectName = $selectedProject.text();

                    var $selectedVersion = $('#selectedVersion').find(':selected');
                    var versionId = $selectedVersion.val();
                    var versionName = $selectedVersion.text();

                    var configuration = {title: title, project: projectId, projectName: projectName, version: versionId, versionName: versionName};
                    service.save(configuration, function () {
                        new IssueTableView().render(configuration);
                    });
                });

                $('#cancelConfiguration').click(function (e) {
                    e.preventDefault();
                    var service = new DashboardItemConfigurationService();
                    service.getConfiguration( function (config) {
                        new IssueTableView().render(config)
                    });
                });
            }
        }
    };

    var DashboardItemConfigurationService = function () {
        var $dashboard = $("meta[name='dashboard']").attr("content");
        var $dashboardItem = $("meta[name='dashboardItem']").attr("content");

        return {
            getConfiguration: function (configuredCallback, errorCallback) {
                AP.require(['request'], function (request) {
                    request({
                        url: '/rest/api/2/dashboard/' + $dashboard+ '/items/' + $dashboardItem + '/properties/itemkey',
                        success: function (response) {
                            configuredCallback(JSON.parse(response).value);
                        }
                    });
                });
            },
            isConfigured: function (configuredCallback, notConfiguredCallback) {
                var that = this;
                AP.require(['request'], function (request) {
                    request({
                        url: '/rest/api/2/dashboard/' + $dashboard+ '/items/' + $dashboardItem + '/properties',
                        success: function (response) {
                            var arrayOfProperties = JSON.parse(response).keys;
                            var configured = _.find(arrayOfProperties, function (property) {
                                return "itemkey" == property.key;
                            });
                            if (configured) {
                                that.getConfiguration(configuredCallback)
                            } else {
                                notConfiguredCallback();
                            }
                        }
                    });
                });
            },
            save: function (configuration, successCallback) {
                AP.require(['request'], function (request) {
                    request({
                        url: '/rest/api/2/dashboard/' + $dashboard+ '/items/' + $dashboardItem + '/properties/itemkey',
                        type: 'PUT',
                        contentType: 'application/json',
                        data: JSON.stringify(configuration),
                        success: successCallback
                    });
                });
            }
        }
    };

    var DashboardItemView = function () {
        return {
            render: function () {
                var service = new DashboardItemConfigurationService();
                service.isConfigured(function (config) {
                    new IssueTableView().render(config)
                }, function () {
                    new DashboardItemConfigurationView().render();
                });
            }
        }
    };

    AP.require(['jira'], function (jira) {

        jira.DashboardItem.onDashboardItemEdit(function () {
            new DashboardItemConfigurationService().getConfiguration(function (config) {
                new DashboardItemConfigurationView().render(config);
            });
        });
    });

    new DashboardItemView().render();
});