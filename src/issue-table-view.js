import IssueSearchService from './issue-search-service';

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
            {noEpic, epicString: epics.map(e => e.key).join(','), label: config.label, hasAlerts: progress.hasAlerts}));
        }
      } else {
        $('#addon-wrapper').html(_.template($('#noIssuesTemplate').html()));
      }
    }
  };
};

export default IssueTableView;