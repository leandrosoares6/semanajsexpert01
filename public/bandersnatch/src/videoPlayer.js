class VideoMediaPlayer {
  constructor({ manifestJSON, network, videoComponent }) {
    this.manifestJSON = manifestJSON;
    this.network = network;
    this.videoComponent = videoComponent;

    this.videoElement = null;
    this.sourceBuffer = null;
    this.activeItem = {};
    this.selected = {};
    this.selections = [];
    this.videoDuration = 0;
  }

  initializeCodec() {
    this.videoElement = document.getElementById('vid');

    const mediaSourceSupported = !!window.MediaSource;

    if (!mediaSourceSupported) {
      alert('Browser not supported.');
      return;
    }

    const codecSupported = window.MediaSource.isTypeSupported(
      this.manifestJSON.codec
    );

    if (!codecSupported) {
      alert(`Browser not support the codec: ${this.manifestJSON.codec}`);
      return;
    }

    const mediaSource = new MediaSource();
    this.videoElement.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener(
      'sourceopen',
      this.sourceOpenWrapper(mediaSource)
    );
  }

  sourceOpenWrapper(mediaSource) {
    return async (_) => {
      this.sourceBuffer = mediaSource.addSourceBuffer(this.manifestJSON.codec);
      const selected = (this.selected = this.manifestJSON.intro);

      // prevent running as "LIVE"
      mediaSource.duration = this.videoDuration;
      await this.fileDownload(selected.url);
      setInterval(this.waitForQuestions.bind(this), 200);
    };
  }

  waitForQuestions() {
    const currentTime = parseInt(this.videoElement.currentTime);
    const option = this.selected.at === currentTime;

    if (!option) return;

    // prevent open the modal 2 times in same second
    if (this.activeItem.url === this.selected.url) return;
    this.videoComponent.configureModal(this.selected.options);
    this.activeItem = this.selected;
  }

  async currentFileResolution() {
    const LOWEST_RESOLUTION = 144;
    const prepareUrl = {
      url: this.manifestJSON.finalizar.url,
      fileResolution: LOWEST_RESOLUTION,
      fileResolutionTag: this.manifestJSON.fileResolutionTag,
      hostTag: this.manifestJSON.hostTag,
    }

    const url = this.network.parseManifestURL(prepareUrl);
    return this.network.getProperResolution(url);
  }

  async nextChunk(data) {
    const key = data.toLowerCase();
    const selected = this.manifestJSON[key];

    this.selected = {
      ...selected,
      // adjust the time when show modal based in current time
      at: parseInt(this.videoElement.currentTime + selected.at),
    };
    this.manageLag(this.selected);

    this.videoElement.play();
    // let the rest of the video run while downloading the new video
    await this.fileDownload(selected.url);
  }

  manageLag(selected) {
    if (!!~this.selections.indexOf(selected.url)) {
      selected.at += 5;
      return;
    }

    this.selections.push(selected.url);
  }

  async fileDownload(url) {
    const fileResolution = await this.currentFileResolution();
    console.log('currentResolution', fileResolution);
    const prepareUrl = {
      url,
      fileResolution,
      fileResolutionTag: this.manifestJSON.fileResolutionTag,
      hostTag: this.manifestJSON.hostTag,
    };

    const finalUrl = this.network.parseManifestURL(prepareUrl);
    this.setVideoPlayerDuration(finalUrl);
    const data = await this.network.fetchFile(finalUrl);

    return this.processBufferSegments(data);
  }

  setVideoPlayerDuration(finalURL) {
    const bars = finalURL.split('/');
    const [, videoDuration] = bars[bars.length - 1].split('-');
    this.videoDuration += parseFloat(videoDuration);
  }

  async processBufferSegments(allSegments) {
    const sourceBuffer = this.sourceBuffer;
    sourceBuffer.appendBuffer(allSegments);

    return new Promise((resolve, reject) => {
      const updateEnd = (_) => {
        sourceBuffer.removeEventListener('updateend', updateEnd);
        sourceBuffer.timestampOffset = this.videoDuration;

        return resolve();
      };

      sourceBuffer.addEventListener('updateend', updateEnd);
      sourceBuffer.addEventListener('error', reject);
    });
  }
}
