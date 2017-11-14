/* add-on script */
const MAX_RESULTS = 500;

const getEpicKeys = epics => epics.map(e => e.key).join(',');

const getWigProgress = function (epics) {
  const wig = epics.reduce((acc, epic) => {
    acc.toDo += epic.toDo;
    acc.inProgress += epic.inProgress;
    acc.done += epic.done;
    acc.total += epic.toDo + epic.inProgress + epic.done;
    acc.hasAlerts |= (epic.notInWigCount > 0);
    return acc;
  }, {toDo: 0, inProgress: 0, done: 0, total: 0, hasAlerts: false});

  wig.percentTodo = (wig.total > 0) ? (wig.toDo / wig.total) * 100 : 0;
  wig.percentInProgress = (wig.total > 0) ? (wig.inProgress / wig.total) * 100 : 0;
  wig.percentDone = (wig.total > 0) ? (wig.done / wig.total) * 100 : 0;

  return wig;
};

const getWigDates = function (config) {
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
};

$(document).ready(function () {

  const IssueTableView = function () {
    function sortBySummary (a, b) {
      return a.summary < b.summary ? -1 : a.summary > b.summary ? 1 : 0;
    }

    return {
      render: async function (config) {
        AP.jira.setDashboardItemTitle(config ? config.title : 'WIG Dashboard');

        $('#addon-wrapper').html(_.template($('#loadingTemplate').html()));
        const issueService = new IssueSearchService(config);
        const {epics, noEpic} = await issueService.getEpics();

        if (epics.length > 0) {
          const progress = getWigProgress(epics);
          const dates = getWigDates(config);

          const addonWrapper = _.template($('#addonWrapperTemplate').html());
          $('#addon-wrapper').html(addonWrapper({progress, dates, label: config.label, hasAlerts: progress.hasAlerts}));

          const $epicTable = $('#epics-in-wig').find('tbody');
          const epicTableRow = _.template($('#epicTableRow').html());
          const epicTableLastRow = _.template($('#epicTableLastRow').html());

          epics.sort(sortBySummary).forEach(epic => {
            $epicTable.append(epicTableRow({epic, label: config.label, hasAlerts: progress.hasAlerts}));
          });

          if (noEpic.issues.length > 0) {
            $epicTable.append(epicTableLastRow(
              {noEpic, epicString: getEpicKeys(epics), label: config.label, hasAlerts: progress.hasAlerts}));
          }
        } else {
          $('#addon-wrapper').html(_.template($('#noIssuesTemplate').html()));
        }
      }
    };
  };

  const IssueSearchService = function (config) {
    let epic_link_id = '';

    async function getCustomIds () {
      const response = await AP.request('/rest/api/2/field');
      const fields = JSON.parse(response.body) || [];

      return fields.find(f => f.name === 'Epic Link').id || '';
    }

    async function getEpicList () {
      const jql = encodeURIComponent(`labels = "${config.label}" AND issuetype = Epic`);
      const response = await AP.request(`/rest/api/2/search?jql=${jql}`);
      const epics = JSON.parse(response.body).issues || [];
      const statusCategoryColors = {
        'Deferred': 'aui-lozenge-error',
        'To Do': 'aui-lozenge-complete',
        'In Progress': 'aui-lozenge-current',
        'Done': 'aui-lozenge-success'
      };

      return epics.map(function (e) {
        e.summary = e.fields.summary;
        e.statusCategoryName = e.fields.status.name === 'Deferred' ? 'Deferred' : e.fields.status.statusCategory.name;
        e.lozengeColorClass = statusCategoryColors[e.statusCategoryName] || '';
        e.issues = [];
        return e;
      });
    }

    async function getIssuesNotInEpics (epics) {
      const jql = encodeURIComponent(
        `labels = "${config.label}" AND issuetype != Epic AND ("Epic Link" is empty or "Epic Link" not in (${getEpicKeys(
          epics)}))`);
      const fields = encodeURIComponent([epic_link_id, 'status', 'key', 'issuetype'].join(','));

      const response = await AP.request(`/rest/api/2/search?jql=${jql}&fields=${fields}&maxResults=${MAX_RESULTS}`);
      const issues = JSON.parse(response.body).issues || [];

      const noEpic = {};
      noEpic.issues = issues.map(issue => issue.key);
      noEpic.toDo = issues.filter(issue => issue.fields.status.statusCategory.name === 'To Do').length;
      noEpic.inProgress = issues.filter(issue => issue.fields.status.statusCategory.name === 'In Progress').length;
      noEpic.done = issues.filter(issue => issue.fields.status.statusCategory.name === 'Done').length;
      return noEpic;
    }

    async function findIssuesNotInWig (epics) {
      const jql = encodeURIComponent(
        `(labels is empty or labels != "${config.label}") AND "Epic Link" in (${getEpicKeys(epics)})`);
      const fields = encodeURIComponent([epic_link_id, 'status', 'key'].join(','));
      const maxResults = 500;

      const response = await AP.request(`/rest/api/2/search?jql=${jql}&fields=${fields}&maxResults=${maxResults}`);
      const issues = JSON.parse(response.body).issues || [];

      epics.forEach(e => {
        e.notInWigCount = issues.filter(i => i.fields[epic_link_id] === e.key).length;
      });
    }

    async function getIssuesInEpics (epics) {
      const jql = encodeURIComponent(`labels = "${config.label}" AND "Epic Link" in (${getEpicKeys(epics)})`);
      const fields = encodeURIComponent([epic_link_id, 'status', 'key', 'issuetype'].join(','));

      async function askJIRAforIssues (startAt, result) {
        const response = await AP.request(`/rest/api/2/search?jql=${jql}&fields=${fields}&startAt=${startAt || 0}`);
        const issues = JSON.parse(response.body);
        const next = issues.startAt + issues.maxResults;
        const totalIssues = result ? result.concat(issues.issues) : issues.issues;

        return (issues.total >= next) ? askJIRAforIssues(next, totalIssues) : totalIssues;
      }

      const issues = await askJIRAforIssues(0, []);

      epics.forEach(e => {
        e.issues = issues.filter(i => e.key === i.fields[epic_link_id]);
        e.toDo = e.issues.filter(i => i.fields.status.statusCategory.name === 'To Do').length;
        e.inProgress = e.issues.filter(i => i.fields.status.statusCategory.name === 'In Progress').length;
        e.done = e.issues.filter(i => i.fields.status.statusCategory.name === 'Done').length;
      });
    }

    function applyScaleFactor (epics, noEpic) {
      const max = [...epics, noEpic].reduce((acc, epic) => (epic.issues.length > acc) ? epic.issues.length : acc, 0);

      [...epics, noEpic].forEach(e => {
        const scaleRatio = 0.35;
        let scaleFactor = 1;
        let divisor = e.issues.length;

        if (config.scalingEnabled && max) {
          scaleFactor = (divisor + (max - divisor) * scaleRatio) / divisor;
          divisor = max;
        }

        e.percentTodo = divisor ? (e.toDo / divisor) * 100 * scaleFactor : 0;
        e.percentInProgress = divisor ? (e.inProgress / divisor) * 100 * scaleFactor : 0;
        e.percentDone = divisor ? (e.done / divisor) * 100 * scaleFactor : 0;
      });
    }

    return {
      getEpics: async function () {
        epic_link_id = await getCustomIds();
        const epics = await getEpicList();

        const [noEpic, ,] = await Promise.all([
          getIssuesNotInEpics(epics),
          findIssuesNotInWig(epics),
          getIssuesInEpics(epics)]);

        applyScaleFactor(epics, noEpic);

        return {epics, noEpic};
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
        description: $('#wigDescription').val(),
        startDate: new Date($('#wigStartDate').val() || 0),
        endDate: new Date($('#wigEndDate').val() || 0),
        scalingEnabled: $('#enableScaling').prop('checked')
      };

      service.save(config, () => new IssueTableView().render(config));
    }

    async function cancelButtonHandler (e) {
      e.preventDefault();

      const config = await service.getConfiguration();
      new IssueTableView().render(config);
    }

    return {
      render: function (config) {
        const configTemplate = _.template($('#addonConfigTemplate').html());

        const $addon = $('#addon-wrapper');
        $addon.empty();
        $addon.html(configTemplate({
          title: config ? config.title : 'WIG Status',
          label: config ? config.label : 'WIG',
          start: config ? config.startDate.substring(0, 10) : '',
          end: config ? config.endDate.substring(0, 10) : '',
          description: config ? config.description : ''
        }));

        $('#wigStartDate').datePicker({'overrideBrowserDefault': true});
        $('#wigEndDate').datePicker({'overrideBrowserDefault': true});

        if (config) {
          $('#enableScaling').prop('checked', config.scalingEnabled);
        }

        $('#saveConfiguration').click(saveButtonHandler);
        $('#cancelConfiguration').click(cancelButtonHandler);
      }
    };
  };

  const DashboardItemConfigurationService = function () {
    const db = $('meta[name=\'dashboard\']').attr('content');
    const dbItem = $('meta[name=\'dashboardItem\']').attr('content');

    return {
      getConfiguration: async function () {
        const response = await AP.request(`/rest/api/2/dashboard/${db}/items/${dbItem}/properties/itemkey`);
        return JSON.parse(response.body).value;
      },

      isConfigured: async function () {
        const response = await AP.request(`/rest/api/2/dashboard/${db}/items/${dbItem}/properties`);
        const keys = JSON.parse(response.body);
        return keys.keys.find(row => row.key === 'itemkey');
      },

      save: function (configuration, successCallback) {
        AP.request({
          url: `/rest/api/2/dashboard/${db}/items/${dbItem}/properties/itemkey`,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify(configuration),
          success: successCallback
        });
      }
    };
  };

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
