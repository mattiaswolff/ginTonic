// This is a simple *viewmodel* - JavaScript that defines the data and behavior of your UI
function DependencyViewModel(data) {
  var self = this;
  self.dependencyName = ko.observable(data.dependencyName);
  self.dependencyVersion = ko.observable(data.dependencyVersion);
}

function VersionViewModel(data) {
  var self = this;
  self.versionVersion = ko.observable(data.versionVersion);
  self.versionReleaseNotes = ko.observable(data.versionReleaseNotes);
  self.versionDownloadURL = ko.observable(data.versionDownloadURL);
  self.versionDependencies = ko.observableArray(data.versionDependencies);
}

function ModalViewModel(data) {
  var self = this;
  self.modalName = ko.observable(data.modalName);
  self.modalDescription = ko.observable('');
  self.modalCategory = ko.observable('');
  self.modalLatestVersion = ko.observable('');
  self.modalImgURL = ko.observable('');
  self.modalURL = ko.observable('');
  self.modalCurrentVersion = ko.observable('');
  self.modalDependencies = ko.observableArray([]);
  self.modalVersions = ko.observableArray([]);
}

function Application(data) {
	var self = this;
  self.appName = ko.observable(data.appName);
  self.appFriendlyName = ko.observable(data.appFriendlyName);
  self.appDescription = ko.observable(data.appDescription);
  self.appDownloadCount = ko.observable(data.appDownloadCount);
  self.appCategory = ko.observable(data.appCategory);
  self.appImgURL = ko.observable(data.appImgURL);
  self.appURL = ko.observable(data.appURL);
  self.appLatestVersion = ko.observable(data.appLatestVersion);
  self.appLatestUpdate = ko.observable(data.appLatestUpdate);
  self.appLatestVersionDownloadURL = ko.observable(data.appLatestVersionDownloadURL);
  self.appVersions = ko.observableArray(data.appVersions);
  self.appDependencies = ko.observableArray(data.appDependencies);
  self.appCategoryCss = ko.computed(function() {
    switch (self.appCategory()) {
        case "Application": return "label-application";
        case "EDI": return "label-edi";
        case "Platform": return "label-platform";
        case "Tool": return "label-tool";
        case "Other": return "label-other";
        default: return "";
    }
  });
}

function AppViewModel() {
	var self = this;
  self.modal = new ModalViewModel('');
  self.applications = ko.observableArray([]);
  
  self.modalSetValues = function(model, event) {
    window.location.hash = model.appName();
    self.modal.modalName(model.appFriendlyName());
    self.modal.modalDescription(model.appDescription());
    self.modal.modalCategory(model.appCategory());
    self.modal.modalVersions(model.appVersions());
    self.modal.modalDependencies(model.appDependencies());
    self.modal.modalCurrentVersion(model.appVersions()[0]);
  };
}

window.vm = new AppViewModel();
// Activates knockout.js
ko.applyBindings(vm);
$('.selectpicker').selectpicker();

$(document).ready(function() {
  $.getJSON("/api/applications/", function(data) {
    $.each(data, function (i) {  
      var dependencies = [];
      var versions = [];
      data = data.sort(function(a, b) {
        a = a.friendlyName;
        b = b.friendlyName;
        return (a < b) ? -1 : ((a > b) ? 1 : 0);
      });
      for (var k = (data[i].versions.length -1); k >= 0; k--) {

        $.each(data[i].versions[k].dependencies, function(j) {
          dependencies.push(new DependencyViewModel({dependencyName: data[i].versions[k].dependencies[j].name, dependencyVersion: data[i].versions[k].dependencies[j].version})); 
        });

        versions.push(new VersionViewModel({versionVersion: data[i].versions[k].version, versionDownloadURL: data[i].versions[k].downloadUrl, versionReleaseNotes: data[i].versions[k].releaseNotes, versionDependencies: dependencies })); 
        dependencies = []
      }

      $.each(data[i].latestVersion.dependencies, function(j) {
        dependencies.push(new DependencyViewModel({dependencyName: data[i].latestVersion.dependencies[j].name, dependencyVersion: data[i].latestVersion.dependencies[j].version})); 
      });
      
      if (!(data[i].friendlyName)) {
        data[i].friendlyName = data[i].name;
      }
      window.vm.applications.push(new Application({appName: data[i].name, appFriendlyName: data[i].friendlyName, appDescription: data[i].description, appDownloadCount: data[i].meta.downloadCount, appImgURL: data[i].imageUrl, appCategory: data[i].category, appURL: data[i].url, appLatestVersion: data[i].latestVersion.version, appLatestUpdate: data[i].latestVersion.latestUpdate, appLatestVersionDownloadURL: data[i].latestVersion.downloadUrl,  appDependencies: dependencies, appVersions: versions}));
    });
    
    // get the first collection
    $applications = $('#applications');
    // clone applications to get a second collection
    $data = $applications.clone();

    if(window.location.hash) {
      var string = 'div[data-id=' + window.location.hash.substring(1) + ']';
      var hashApplication = ko.dataFor($(string)[0]);
      window.vm.modalSetValues(hashApplication);
      $('#myModal').modal('show');
    }
  });

    
    var $filterType = $('#filter input[name="type"]');
    var $sortType = $('#sort input[name="sort"]');

    var $filterTypeMobile = $('#filter select[name="type"]');
    var $sortTypeMobile = $('#sort select[name="sort"]');

    var sortAndFilterApplications = function($filterTypeValue, $sortTypeValue) {

  if ($filterTypeValue == 'all') {
    var $filteredData = $data.children();
  } else {
    var $filteredData = $data.children('div[data-type=' + $filterTypeValue + ']');
  }

  if ($sortTypeValue == 'Alphabetical') {
    $filteredData.sort(function(a, b) {
      a = $('.app-header h2', a).text();
      b = $('.app-header h2', b).text();
      return (a < b) ? -1 : ((a > b) ? 1 : 0);
    });
  } else if ($sortTypeValue == 'Popular') {
    $filteredData.sort(function(a, b) {
      a = $('.app-actions span[data-type=downloadCount]', a).text();
      b = $('.app-actions span[data-type=downloadCount]', b).text();
      return (b - a);
  });
  } else if ($sortTypeValue == 'Update') {
    $filteredData.sort(function(a, b) {
      a = $('.app-actions span[data-type=latestUpdate]', a).text();
      b = $('.app-actions span[data-type=latestUpdate]', b).text();
      return (a > b) ? -1 : ((a < b) ? 1 : 0);
    });
  }

  $applications.quicksand($filteredData, {
    duration: 800
  });  
}
    
    $filterType.change(function (e) {
      sortAndFilterApplications($filterType.filter('input:checked').val(), $sortType.filter('input:checked').val());
    });
    $sortType.change(function (e) {
      sortAndFilterApplications($filterType.filter('input:checked').val(), $sortType.filter('input:checked').val());
    });
    $filterTypeMobile.change(function (e) {
      sortAndFilterApplications($filterTypeMobile.val(), $sortTypeMobile.val());
    });
    $sortTypeMobile.change(function (e) {
      sortAndFilterApplications($filterTypeMobile.val(), $sortTypeMobile.val());
    });
    $('#myModal').on('hidden.bs.modal', function () {
      window.location.hash = '';
    })
    
});