import DashboardItemConfigurationService from './config-service';
import IssueTableView from './issue-table-view';

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

      AJS.$('#wigStartDate').datePicker({'overrideBrowserDefault': true});
      AJS.$('#wigEndDate').datePicker({'overrideBrowserDefault': true});

      if (config) {
        $('#enableScaling').prop('checked', config.scalingEnabled);
      }

      $('#saveConfiguration').click(saveButtonHandler);
      $('#cancelConfiguration').click(cancelButtonHandler);
    }
  };
};

export default DashboardItemConfigurationView;