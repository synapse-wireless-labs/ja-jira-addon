/* add-on script */
$( document ).ready(function() {

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

                var sizeDict = function (d) {
                    c=0;
                    for (i in d)
                        ++c;
                    return c
                };

                new IssueSearchService(configuration.project, configuration.version)
                        .getEpics(function (epics, startDate, endDate) {
                            if (sizeDict(epics) == 0) {
                                 $('#issues-in-project').html(_.template($('#noIssuesTemplate').html())({config: configuration}));
                             }
                             else {

                            }
                            if (sizeDict(epics) > 0) {
                                var $release = {};

                                $release.projectName = configuration.projectName;
                                $release.versionName = configuration.versionName;

                                epoch = new Date(0);
                                $release.startDate = "xxx xxx 00 0000";
                                 if (startDate > epoch) {
                                     $release.startDate = startDate.toDateString();
                                 }
                                 $release.endDate = "xxx xxx 00 0000";
                                 if (endDate > epoch) {
                                     $release.endDate = endDate.toDateString();
                                 }



                                $release.startDate = startDate.toDateString();
                                $release.endDate = endDate.toDateString();
                                $release.totalDays = 0;
                                $release.daysPast = 0;
                                $release.daysRemaining = 0;
                                $release.percentDaysDone = 0;
                                $release.percentDaysRemaining = 0;

                                $release.toDoPoints = 0;
                                $release.inProgressPoints = 0;
                                $release.donePoints = 0;
                                $release.percentTodo = 0;
                                $release.percentInProgress = 0;
                                $release.percentDone = 0;

                                $.each(epics, function (i, $epic) {
                                    $release.toDoPoints += $epic.toDoPoints;
                                    $release.inProgressPoints += $epic.inProgressPoints;
                                    $release.donePoints += $epic.donePoints;
                                });

                                $release.totalPoints = $release.toDoPoints + $release.inProgressPoints + $release.donePoints;

                                msPerDay = 1000 * 60 * 60 * 24;
                                today = new Date();

                                if (endDate > startDate) {
                                    $release.totalDays = Math.floor((endDate - startDate) / msPerDay);
                                }
                                if (today > startDate) {
                                    $release.daysPast = Math.floor((today - startDate) / msPerDay);
                                }
                                if (endDate > today) {
                                    $release.daysRemaining = Math.floor((endDate - today) / msPerDay);
                                }
                                if ($release.totalDays > 0) {
                                    $release.percentDaysDone = ($release.daysPast / $release.totalDays) * 100;
                                    $release.percentDaysRemaining = ($release.daysRemaining / $release.totalDays) * 100;
                                }

                                if ($release.totalPoints > 0) {
                                    $release.percentTodo = ($release.toDoPoints / $release.totalPoints) * 100;
                                    $release.percentInProgress = ($release.inProgressPoints / $release.totalPoints) * 100;
                                    $release.percentDone = ($release.donePoints / $release.totalPoints) * 100;
                                }

                                $('#issues-in-project').html(_.template($('#issuesTableTemplate').html())({}));
                                $('#issuesHeader').html(_.template($('#issuesHeaderTemplate').html())({release: $release}));

                                var epicTable = $('#issuesTable tbody');
                                $.each(epics, function (i, $epic) {
                                    epicTable.append(_.template($('#issueTableRow').html())({epic: $epic}));
                                });

                                $('#issuesFooter').html(_.template($('#issuesFooterTemplate').html())({config: configuration}));
                            }
                        })
                }
            }
    };

    var IssueSearchService = function (project, version) {
        return {
            getEpics: function(callback) {
                AP.require(['request'], function (request) {
                    var epics={};

                    var getEpicList = function(callback) {
                        var jql = encodeURIComponent('project = ' + project + ' AND fixVersion = ' + version + ' AND issuetype = Epic ORDER BY status, duedate');

                        request({
                            url: '/rest/api/2/search?jql=' + jql,
                            success: function (response) {
                                var epicsJson = JSON.parse(response).issues;
                                callback(epicsJson);
                            }
                        });
                    };

                    var getReleaseDates = function(callback) {
                        var releaseStartDate = new Date(0);
                        var releaseEndDate = new Date(0);

                        request({
                            url: 'rest/api/2/project/' + project + '/versions',
                            success: function (response) {
                                //alert("got the API successfully!")
                                var versions = JSON.parse(response);
                                $.each(versions, function (i, v) {
                                    if (v.id == version) {
                                        releaseStartDate = v.userStartDate;
                                        releaseEndDate = v.userReleaseDate;
                                        //alert(releaseStartDate + ',' + releaseEndDate);
                                    }
                                });

                                callback(releaseStartDate, releaseEndDate);
                            },
                            error: function (response) {
                                //alert("unable to get version dates from project!")
                                callback(releaseStartDate, releaseEndDate);
                            }
                        });
                    };

                    var getCustomIds = function(callback) {
                        var story_points_id = '';
                        var epic_link_id = '';

                        request({
                            url: '/rest/api/2/field',
                            success: function (response) {
                                var fields = JSON.parse(response);
                                $.each(fields, function (i, field) {
                                    if (field.name == "Story Points") {
                                        story_points_id = field.id;
                                    } else if (field.name == "Epic Link") {
                                        epic_link_id = field.id;
                                    }
                                });

                                callback(story_points_id, epic_link_id);
                            }
                        });
                    };

                    getReleaseDates(function (release_start_date, release_end_date) {

                        getCustomIds(function (story_points_id, epic_link_id) {

                            var getIssuesFromEpics = function (callback) {
                                var keylist = [];
                                $.each(epics, function (i, epic) {
                                    keylist.push(epic.key);
                                });
                                if (keylist.length > 0) {
                                    var jql = encodeURIComponent('project = ' + project + ' AND fixVersion = ' + version + ' AND "Epic Link" in (' + keylist.join(',') + ')');
                                    var fields = encodeURIComponent([epic_link_id, story_points_id, 'status', 'key'].join(','));

                                    request({
                                        url: '/rest/api/2/search?jql=' + jql + '&fields=' + fields + '&maxResults=500',
                                        success: function (response) {
                                            var issues = JSON.parse(response).issues;
                                            callback(issues);
                                        }
                                    });
                                }
                                else {
                                    var issues = {};
                                    callback(issues);
                                }
                            };

                            getEpicList(function (epicsJson) {
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
                                    e.percentComplete = 0;

                                });

                                getIssuesFromEpics(function (issuesJson) {
                                    $.each(issuesJson, function (i, issue) {
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

                                    $.each(epicsJson, function (i, epic) {
                                        epic.percentTodo = (epic.toDoPoints / epic.totalPoints) * 100;
                                        epic.percentInProgress = (epic.inProgressPoints / epic.totalPoints) * 100;
                                        epic.percentComplete = (epic.donePoints / epic.totalPoints) * 100;
                                        epic.unestimatedStoryCount = epic.storyCount - epic.estimatedStoryCount;
                                        epic.percentUnestimatedStories = Math.floor((epic.unestimatedStoryCount / epic.storyCount) * 100);
                                    });

                                    callback(epics, release_start_date, release_end_date);
                                });
                            });
                        });
                    });
                });
            }
        }
    };

    var DashboardItemConfigurationView = function () {
        return {
            template: function (value) {
                return _.template($('#dashboardItemConfigTemplate').html())(value);
            },
            addProjects: function (config, addVersions) {
                AP.require(['request'], function (request) {
                    request({
                        url: '/rest/api/2/project',
                        success: function (response) {
                            var projects = JSON.parse(response);
                            var selectedProject = $('#selectedProject');
                            $.each(projects, function (index, project) {
                                var select = $('<option>', {value: project.id}).text(project.name);
                                if (config && config.project == project.id) {
                                    selectedProject.append(select.attr('selected', 'selected'));
                                }
                                selectedProject.append(select);
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
                            var selectedVersion = $('#selectedVersion');
                            selectedVersion.empty();
                            var versions = JSON.parse(response).versions;
                            $.each(versions, function (index, version) {
                                var versionOption = $('<option>', {value: version.id}).text(version.name);
                                if (config && config.version == version.id) {
                                    selectedVersion.append(versionOption.attr('selected', 'selected'));
                                }
                                selectedVersion.append(versionOption);
                            });
                        }
                    })
                });
            },
            render: function (config) {
                if (config) {
                    $('#issues-in-project').html(this.template({itemTitle: config.title}));
                } else {
                    $('#issues-in-project').html(this.template({itemTitle: 'Issues for project'}));
                }
                this.addProjects(config, this.addVersions);

                $('#selectedProject').change(config, this.addVersions);
                $('#saveConfiguration').click(function (e) {
                    e.preventDefault();
                    var service = new DashboardItemConfigurationService();
                    var $title = $('#itemTitle').val();
                    var $project = $('#selectedProject').find(':selected').val();
                    var $projectName = $('#selectedProject').find(':selected').text();
                    var $version = $('#selectedVersion').find(':selected').val();
                    var $versionName = $('#selectedVersion').find(':selected').text();
                    var configuration = {title: $title, project: $project, projectName: $projectName, version: $version, versionName: $versionName};
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