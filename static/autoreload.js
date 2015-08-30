// Long polling client for live reload
// @author: ian

;function AutoReload(options) {
  if (typeof XMLHttpRequest === 'undefined') {
    throw new Error("Browser does not support AutoReload");
  }

  // https://gist.github.com/iwek/5599777
  function ajaxGet(settings) {
    var xhr = new XMLHttpRequest();
  	xhr.onreadystatechange = function() {
  		if (xhr.readyState !== 4) {
  			return;
  		}

  		if (xhr.status === 200) {
  			settings.success(JSON.parse(xhr.responseText));
  		}
      else {
        settings.error(JSON.parse(xhr.responseText));
      }
  	};

  	xhr.open('GET', settings.url, true);
  	xhr.send('');
    return xhr;
  }

  this.watch = function() {
    var _self = this;

    // Collect linked stylesheets from localhost.
    this._collectLinkedStylesheets();

    (function poll() {
      _self.xhr = ajaxGet({
        url: window.location.protocol + '//localhost:' + options.port + '/autoreload/listen',
        success: function(data) {
          _self.reload(data);
        },
        error: function() {
          console.error("Error connecting to the autoreload server");
          _self.xhr = null;
        },
        timeout: 1000*60*10,
        dataType: 'json'
      });
    })();
  };

  this.stop = function() {
    if (this.xhr) this.xhr.abort();
  }

  this.reload = function(changedFiles) {
    // If the changed file is a stylesheet, try and reload the stylesheet
    // without a full page reload.
    if (changedFiles.length === 0)
      return;

    // If only stylesheets have changed
    var onlyStylesheets = true;
    for (var i=0; i<changedFiles.length; i++) {
      if (!/\.css$/.test(changedFiles)) {
        onlyStylesheets = false;
        break;
      }
    }

    if (onlyStylesheets === true) {
      var atLeastOneStylesheetReattached = false;
      // Reload the stylesheet
      for (var i=0; i<changedFiles.length; i++) {
        var existingLink = this._linkedStylesheets[changedFiles[i]];
        if (existingLink) {
          atLeastOneStylesheetReattached = true;
          this._reattachStylesheetLink(existingLink);
        }
      }

      if (atLeastOneStylesheetReattached === true)
        return;
    }

    // Fallback is to just reload the whole window
    window.location.reload();
  };

  this._collectLinkedStylesheets = function() {
    var tags = document.getElementsByTagName('link');
    var links = [];
    for (var i=0; i<links.length; i++) {
      if (!link.rel || link.rel.toLowerCase() !== 'stylesheet' || !link.href)
        continue;

      var hostname = 'localhost:' + options.port + '/';
      var hostnameIndex = link.href.indexOf(hostname);
      if (hostnameIndex === -1)
        continue;

      // Chop off the host and just return the path to the stylesheet
      links[link.href.slice(hostnameIndex + 1)] = link;
    }
    this._linkedStylesheets = links;
  };

  // Reattach a changed stylesheet link
  this._reattachStylesheetLink = function(link) {
    var clone = link.cloneNode(false);
    var parent = link.parentNode;

    if (parent.lastChild === link) {
      parent.appendChild(clone);
    } else {
      parent.insertBefore(clone, link.nextSibling);
    }

    var additionalWaitingTime;
    if (/AppleWebKit/.test(navigator.userAgent)) {
      additionalWaitingTime = 5;
    } else {
      additionalWaitingTime = 200;
    }

    setTimeout(function() {
      if (!link.parentNode) {
        return;
      }
      link.parentNode.removeChild(link);
      clone.onreadystatechange = null;
    }, additionalWaitingTime);
  };
}
