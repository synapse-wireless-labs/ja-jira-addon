const MAX_RESULTS = 500;
const getEpicKeys = epics => epics.map(e => e.key).join(',');

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

export default IssueSearchService;