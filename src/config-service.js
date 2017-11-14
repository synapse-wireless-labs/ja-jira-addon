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

export default DashboardItemConfigurationService;