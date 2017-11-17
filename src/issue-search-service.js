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

    return epics.map(function (e) {
      e.summary = e.fields.summary;
      e.statusCategoryName = e.fields.status.name === 'Deferred' ? 'Deferred' : e.fields.status.statusCategory.name;
      e.issues = [];
      return e;
    });
  }

  function countIssuesWithStatusCategory(issues, statusCategory) {
    return issues.filter(issue => issue.fields.status.statusCategory.name === statusCategory).length
  }

  async function getIssuesNotInEpics (epics) {
    const jql = encodeURIComponent(
      `labels = "${config.label}" AND issuetype != Epic AND ("Epic Link" is empty or "Epic Link" not in (${getEpicKeys(
        epics)}))`);
    const fields = encodeURIComponent([epic_link_id, 'status', 'key', 'issuetype'].join(','));

    const response = await AP.request(`/rest/api/2/search?jql=${jql}&fields=${fields}&maxResults=${MAX_RESULTS}`);
    const issues = JSON.parse(response.body).issues || [];

    return {
      issues: issues.map(issue => issue.key),
      toDo: countIssuesWithStatusCategory(issues, 'To Do'),
      inProgress: countIssuesWithStatusCategory(issues, 'In Progress'),
      done: countIssuesWithStatusCategory(issues, 'Done')
    };
  }

  async function findIssuesNotInOverall (epics) {
    const jql = encodeURIComponent(
      `(labels is empty or labels != "${config.label}") AND "Epic Link" in (${getEpicKeys(epics)})`);
    const fields = encodeURIComponent([epic_link_id, 'status', 'key'].join(','));
    const maxResults = 500;

    const response = await AP.request(`/rest/api/2/search?jql=${jql}&fields=${fields}&maxResults=${maxResults}`);
    const issues = JSON.parse(response.body).issues || [];

    epics.forEach(e => {
      e.notInOverallCount = issues.filter(i => i.fields[epic_link_id] === e.key).length;
    });
  }

  async function askJIRAforIssues (epics, startAt, result) {
    const jql = encodeURIComponent(`labels = "${config.label}" AND "Epic Link" in (${getEpicKeys(epics)})`);
    const fields = encodeURIComponent([epic_link_id, 'status', 'key', 'issuetype'].join(','));

    const response = await AP.request(`/rest/api/2/search?jql=${jql}&fields=${fields}&startAt=${startAt || 0}`);
    const issues = JSON.parse(response.body);

    const next = issues.startAt + issues.maxResults;
    const totalIssues = result ? result.concat(issues.issues) : issues.issues;

    return (issues.total >= next) ? askJIRAforIssues(epics, next, totalIssues) : totalIssues;
  }

  async function getIssuesInEpics (epics) {
    const issues = await askJIRAforIssues(epics, 0, []);

    epics.forEach(e => {
      e.issues = issues.filter(i => e.key === i.fields[epic_link_id]);
      e.toDo = countIssuesWithStatusCategory(e.issues, 'To Do');
      e.inProgress = countIssuesWithStatusCategory(e.issues, 'In Progress');
      e.done = countIssuesWithStatusCategory(e.issues, 'Done');
    });
  }

  return {
    getEpics: async function () {
      epic_link_id = await getCustomIds();
      const epics = await getEpicList();

      const [noEpic, , ] = await Promise.all([
        getIssuesNotInEpics(epics),
        findIssuesNotInOverall(epics),
        getIssuesInEpics(epics)]);

      return {epics, noEpic};
    }
  };
};

export default IssueSearchService;