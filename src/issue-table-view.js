const getOverallDates = function (config) {
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

const percentOf = function (numerator, divisor, scaleFactor) {
  return divisor ? (numerator / divisor) * 100 * scaleFactor : 0;
};

const calculatePercents = function (e, divisor, scaleFactor = 1) {
  e.percentTodo = percentOf(e.toDo, divisor, scaleFactor);
  e.percentInProgress = percentOf(e.inProgress, divisor, scaleFactor);
  e.percentDone = percentOf(e.done, divisor, scaleFactor);
};

const getOverallProgress = function (epics) {
  const progress = epics.reduce((acc, epic) => {
    acc.toDo += epic.toDo;
    acc.inProgress += epic.inProgress;
    acc.done += epic.done;
    acc.total += epic.toDo + epic.inProgress + epic.done;
    acc.hasAlerts |= (epic.notInOverallCount > 0);
    return acc;
  }, {toDo: 0, inProgress: 0, done: 0, total: 0, hasAlerts: false});

  calculatePercents(progress, progress.total);
  return progress;
};

const applyEpicScaling = function (config, epics, noEpic) {
  const SCALE_RATIO = 0.35;
  const findMax = (acc, epic) => (epic.issues.length > acc) ? epic.issues.length : acc;
  const max = config.scalingEnabled ? [...epics, noEpic].reduce(findMax, 0) : 0;

  [...epics, noEpic].forEach(e => {
    calculatePercents(e,
      max ? max : e.issues.length,
      max ? (e.issues.length + (max - e.issues.length) * SCALE_RATIO) / e.issues.length : 1);
  });
};

const IssueTableView = function () {
  const _addonWrapperTemplate = _.template($('#addonWrapperTemplate').html());
  const _epicTableRowTemplate = _.template($('#epicTableRow').html());
  const _epicTableLastRowTemplate = _.template($('#epicTableLastRow').html());

  function sortBySummary (a, b) {
    return a.summary < b.summary ? -1 : a.summary > b.summary ? 1 : 0;
  }

  const getEpicLozengeColor = function (epic) {
    const statusCategoryColors = {
      'Deferred': 'aui-lozenge-error',
      'To Do': '', // default
      'In Progress': 'aui-lozenge-current',
      'Done': 'aui-lozenge-success'
    };

    return statusCategoryColors[epic.statusCategoryName] || '';
  };

  return {
    render: async function (config, epics, noEpic) {
      applyEpicScaling(config, epics, noEpic);

      const dates = getOverallDates(config);
      const progress = getOverallProgress(epics);

      $('#addon-wrapper').html(_addonWrapperTemplate({config, progress, dates}));
      const $epicTable = $('#epic-table').find('tbody');

      epics.sort(sortBySummary).forEach(epic => {
        const lozengeColor = getEpicLozengeColor(epic);
        $epicTable.append(_epicTableRowTemplate({config, progress, epic, lozengeColor, }));
      });

      if (noEpic.issues.length > 0) {
        const epicString = epics.map(e => e.key).join(',');
        $epicTable.append(_epicTableLastRowTemplate({config, progress, noEpic, epicString}));
      }
    }
  };
};

export default IssueTableView;