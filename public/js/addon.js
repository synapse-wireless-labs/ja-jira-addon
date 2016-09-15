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

                new IssueSearchService(configuration.project, configuration.version, configuration.scalingEnabled)
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
                    });

                new IssueSearchService(configuration.project, configuration.version, configuration.scalingEnabled)
                    .getEpics(function (epics) {
                        if (sizeDict(epics) == 0) {
                             $('#addon-wrapper').html(_.template($('#noIssuesTemplate').html())({config: configuration}));
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

                            $('#addon-wrapper').html(_.template($('#addonWrapperTemplate').html())({config: configuration}));
                            $('#addon-header-table').find('tbody').append(_.template($('#addonHeaderDateRowTemplate').html())({release: releaseInfo}));
                            $('#addon-header-table').find('tbody').prepend(_.template($('#addonHeaderOverallRowTemplate').html())({release: releaseInfo}));

                            var $epicsInRelease = $('#epics-in-release');
                            $epicsInRelease.html(_.template($('#epicTableTemplate').html())({}));

                            var epicTable = $epicsInRelease.find('tbody');
                            $.each(epics, function (i, $epic) {
                                if ($epic.key != "NO_EPIC")
                                {
                                    epicTable.append(_.template($('#epicTableRow').html())({
                                        epic: $epic,
                                        versionName: configuration.versionName
                                    }));
                                }
                            });

                            if (epics["NO_EPIC"].storyCount) {
                                var epicKeys = [];
                                $.each(epics, function (i, epic) {
                                    if (epic.key != "NO_EPIC") {
                                        epicKeys.push(epic.key);
                                    }
                                });
                                epicTable.append(_.template($('#epicTableLastRow').html())({issues: epics["NO_EPIC"], epicString: epicKeys.join(','), projectName: configuration.projectName, versionName: configuration.versionName}));
                            }
                        }
                    })
                }
            }
    };

    var IssueSearchService = function (project, version, scaling) {
        var releaseStartDate = new Date(0);
        var releaseEndDate = new Date(0);
        var epics = {};
        var issuesNotInEpics = {};
        var story_points_id = "";
        var epic_link_id = "";

        function askJIRAforEpics() {
            var jql = encodeURIComponent('project = ' + project + ' AND fixVersion = ' + version + ' AND issuetype = Epic ORDER BY Rank');
            return askJIRA('/rest/api/2/search?jql=' + jql);
        }

        function processEpics(response) {
            var epicsJson = JSON.parse(response).issues || [];
            $.each(epicsJson, function (i, e) {
                epics[e.key] = e;

                e.summary = e.fields.summary;
                e.statusCategoryName = e.fields.status.statusCategory.name;

                e.lozengeColorClass = "";
                switch (e.statusCategoryName) {
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
                e.notInReleaseStoryCount = 0;
                e.totalPoints = 0;
                e.toDoPoints = 0;
                e.inProgressPoints = 0;
                e.donePoints = 0;
                e.percentTodo = 0;
                e.percentInProgress = 0;
                e.percentDone = 0;

            });
            return RSVP.resolve();
        }

        function askJIRAforReleaseDates() {
            return askJIRA('/rest/api/2/project/' + project + '/versions');
        }

        function processReleaseDates(response) {
            var versions = JSON.parse(response) || [];
            $.each(versions, function (i, v) {
                if (v.id == version) {
                    releaseStartDate = new Date(v.userStartDate || 0);
                    releaseEndDate = new Date(v.userReleaseDate || 0);
                }
            });
            return RSVP.resolve();
        }

        function askJIRAforCustomIds () {
            return askJIRA('/rest/api/2/field');
        }

        function processCustomIds(response) {
            var fields = JSON.parse(response) || [];
            $.each(fields, function (i, field) {
                if (field.name == "Story Points") {
                    story_points_id = field.id;
                } else if (field.name == "Epic Link") {
                    epic_link_id = field.id;
                }
            });
            return RSVP.resolve();
        }

        function askJIRAforIssues() {
            if (sizeDict(epics) == 0) {
                return RSVP.resolve("{}");
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
            var issues = JSON.parse(response).issues || [];

            $.each(issues, function (i, issue) {
                epic = epics[issue.fields[epic_link_id]];
                epic.stories.push(issue.key);
                epic.storyCount += 1;

                var story_points = issue.fields[story_points_id] === null ? -1 : issue.fields[story_points_id];

                if (story_points >= 0) {
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

            if (sizeDict(epics) > 0) {
                epics["NO_EPIC"] = issuesNotInEpics;
            }

            $.each(epics, function (i, epic) {
                var scaleFactor = 1;
                var divisor = epic.totalPoints;

                if (scaling) {
                    var maxPoints = 0;
                    $.each(epics, function (i, epic) {
                        if (epic.totalPoints > maxPoints) {
                            maxPoints = epic.totalPoints;
                        }
                    });
                    if (maxPoints) {
                        var scaleRatio = 0.35;
                        scaleFactor = (epic.totalPoints + (maxPoints - epic.totalPoints) * scaleRatio) / epic.totalPoints;
                        divisor = maxPoints;
                    }
                }

                if (divisor) {
                    epic.percentTodo = (epic.toDoPoints / divisor) * 100 * scaleFactor;
                    epic.percentInProgress = (epic.inProgressPoints / divisor) * 100 * scaleFactor;
                    epic.percentDone = (epic.donePoints / divisor) * 100 * scaleFactor;
                }
                epic.unestimatedStoryCount = epic.storyCount - epic.estimatedStoryCount;

                if (epic.storyCount) {
                    epic.percentUnestimatedStories = Math.floor((epic.unestimatedStoryCount / epic.storyCount) * 100);
                }
            });

            return RSVP.resolve();
        }

        function askJIRAforIssuesInOtherReleases() {
            if (sizeDict(epics) == 0) {
                return RSVP.resolve("{}");
            }
            else {
                var epicKeys = [];
                $.each(epics, function (i, epic) {
                    epicKeys.push(epic.key);
                });

                var jql = encodeURIComponent('project = ' + project + ' AND (fixVersion is empty or fixVersion != ' + version + ') AND "Epic Link" in (' + epicKeys.join(',') + ')');
                var fields = encodeURIComponent([epic_link_id, story_points_id, 'status', 'key'].join(','));
                var maxResults = 500;

                return askJIRA('/rest/api/2/search?jql=' + jql + '&fields=' + fields + '&maxResults=' + maxResults);
            }
        }

        function processIssuesInOtherReleases (response) {
            var issues = JSON.parse(response).issues || [];

            $.each(issues, function (i, issue) {
                epic = epics[issue.fields[epic_link_id]];
                epic.notInReleaseStoryCount += 1;
            });

            return RSVP.resolve();
        }

        function askJIRAforIssuesNotInEpics() {
            if (sizeDict(epics) == 0) {
                return RSVP.resolve("{}");
            }
            else {
                var epicKeys = [];
                $.each(epics, function (i, epic) {
                    epicKeys.push(epic.key);
                });

                var jql = encodeURIComponent('project = ' + project + ' AND fixVersion = ' + version + ' AND issuetype != Epic AND ("Epic Link" is empty or "Epic Link" not in (' + epicKeys.join(',') + '))');
                var fields = encodeURIComponent([epic_link_id, story_points_id, 'status', 'key'].join(','));
                var maxResults = 500;

                return askJIRA('/rest/api/2/search?jql=' + jql + '&fields=' + fields + '&maxResults=' + maxResults);
            }
        }

        function processIssuesNotInEpics (response) {
            var issues = JSON.parse(response).issues || [];

            issuesNotInEpics.key = "NO_EPIC";
            issuesNotInEpics.summary = "Issues without an Epic";
            issuesNotInEpics.lozengeColorClass = "";
            issuesNotInEpics.statusCategoryName = "Unknown";

            issuesNotInEpics.stories = [];
            issuesNotInEpics.storyCount = 0;
            issuesNotInEpics.estimatedStoryCount = 0;
            issuesNotInEpics.unestimatedStoryCount = 0;
            issuesNotInEpics.percentUnestimatedStories = 0;
            issuesNotInEpics.notInReleaseStoryCount = 0;
            issuesNotInEpics.totalPoints = 0;
            issuesNotInEpics.toDoPoints = 0;
            issuesNotInEpics.inProgressPoints = 0;
            issuesNotInEpics.donePoints = 0;
            issuesNotInEpics.percentTodo = 0;
            issuesNotInEpics.percentInProgress = 0;
            issuesNotInEpics.percentDone = 0;

            $.each(issues, function (i, issue) {
                issuesNotInEpics.stories.push(issue.key);
                issuesNotInEpics.storyCount += 1;

                var story_points = issue.fields[story_points_id] === null ? -1 : issue.fields[story_points_id];

                if (story_points) {
                    issuesNotInEpics.estimatedStoryCount += 1;
                    issuesNotInEpics.totalPoints += story_points;

                    switch (issue.fields.status.statusCategory.name) {
                        case "To Do":
                            issuesNotInEpics.toDoPoints += story_points;
                            break;
                        case "In Progress":
                            issuesNotInEpics.inProgressPoints += story_points;
                            break;
                        case "Done":
                            issuesNotInEpics.donePoints += story_points;
                            break;
                    }
                }
            });

            return RSVP.resolve();
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
                    .then(askJIRAforIssuesNotInEpics)
                    .then(processIssuesNotInEpics)
                    .then(askJIRAforIssuesInOtherReleases)
                    .then(processIssuesInOtherReleases)
                    .then(askJIRAforIssues)
                    .then(processIssues)
                    .then(function () {
                        callback(epics);
                    });

            }
        }
    };

    var DashboardItemConfigurationView = function () {
        var service = new DashboardItemConfigurationService();

        function addProjectsAndVersions(config) {
            service.getProjects(function(projects){
                var $selectedProject = $('#selectedProject');

                $.each(projects, function (index, project) {
                    var select = $('<option>', {value: project.id}).text(project.name);
                    if (config && config.project == project.id) {
                        $selectedProject.append(select.attr('selected', 'selected'));
                    }
                    $selectedProject.append(select);
                });

                addVersions(config);
            });
        }

        function addVersions(config) {
            var currentProject = $('#selectedProject').find(':selected').val();
            service.getVersions(currentProject, function(versions){
                var $selectedVersion = $('#selectedVersion');
                $selectedVersion.empty();

                $.each(versions, function (index, version) {
                    var versionOption = $('<option>', {value: version.id}).text(version.name);
                    if (config && config.version == version.id) {
                        $selectedVersion.append(versionOption.attr('selected', 'selected'));
                    }
                    $selectedVersion.append(versionOption);
                });
            });
        }

        function saveButtonHandler(e) {
            e.preventDefault();
            var title = $('#itemTitle').val();

            var $selectedProject = $('#selectedProject').find(':selected');
            var projectId = $selectedProject.val();
            var projectName = $selectedProject.text();

            var $selectedVersion = $('#selectedVersion').find(':selected');
            var versionId = $selectedVersion.val();
            var versionName = $selectedVersion.text();

            var scalingEnabled = $('#enableScaling').prop("checked");

            var configuration = {
                title: title,
                project: projectId,
                projectName: projectName,
                version: versionId,
                versionName: versionName,
                scalingEnabled: scalingEnabled
            };

            service.save(configuration, function () {
                new IssueTableView().render(configuration);
            });
        }

        function cancelButtonHandler(e) {
            e.preventDefault();
            service.getConfiguration( function (config) {
                new IssueTableView().render(config)
            });
        }

        return {
            render: function (config) {
                var $addon = $('#addon-wrapper');
                $addon.empty();
                $addon.html(_.template($('#addonConfigTemplate').html())({itemTitle: config ? config.title : 'Issues for project'}));

                addProjectsAndVersions(config);

                $('#enableScaling').prop("checked", config.scalingEnabled);

                $('#selectedProject').change(config, addVersions);
                $('#saveConfiguration').click(saveButtonHandler);
                $('#cancelConfiguration').click(cancelButtonHandler);
            }
        }
    };

    var DashboardItemConfigurationService = function () {
        var $dashboard = $("meta[name='dashboard']").attr("content");
        var $dashboardItem = $("meta[name='dashboardItem']").attr("content");

        function askJIRAForProjects() {
            return askJIRA('/rest/api/2/project');
        }

        function askJIRAForVersions(project) {
            return askJIRA('/rest/api/2/project/' + project);
        }

        function askJIRAforDashboardItemKey() {
            return askJIRA('/rest/api/2/dashboard/' + $dashboard + '/items/' + $dashboardItem + '/properties/itemkey');
        }

        function askJIRAForDashboardProperties() {
            return askJIRA('/rest/api/2/dashboard/' + $dashboard + '/items/' + $dashboardItem + '/properties');
        }

        function processDashboardProperties(properties) {
            var configured = _.find(properties.keys, function (property) {
                return "itemkey" == property.key;
            });

            return RSVP.resolve(configured);
        }

        return {
            getProjects: function (callback) {
                askJIRAForProjects()
                    .then(JSON.parse)
                    .then( function(projects){
                        callback(projects);
                    });
            },
            getVersions: function (project, callback) {
                askJIRAForVersions(project)
                    .then(JSON.parse)
                    .then( function(project){
                        callback(project.versions);
                    });
            },
            getConfiguration: function (callback) {
                askJIRAforDashboardItemKey()
                    .then(JSON.parse)
                    .then(function (itemkey) {
                        callback(itemkey.value);
                    });
            },
            isConfigured: function (callback) {
                askJIRAForDashboardProperties()
                    .then(JSON.parse)
                    .then(processDashboardProperties)
                    .then(function(configured){
                        callback(configured);
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
                service.isConfigured(function (configured) {
                    if (configured) {
                        service.getConfiguration( function (config) {
                            new IssueTableView().render(config)
                        });
                    } else {
                        new DashboardItemConfigurationView().render();
                    }
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