import React, {
    Component
} from 'react'

import RecorderJS from 'recorderjs';
import {
    TweenLite,
    TweenMax,
    Linear
} from 'gsap';
import dateformat from 'dateformat';

import AudioPlayerDOM from './AudioPlayerDOM';
import { EventEmitter } from './EventEmitter';

class Recorder extends Component {
    
    constructor(props) {
        
        super(props);
        this.baseUrl = process.env.NODE_ENV === 'production' ? 'https://audio.betablocks.city' : 'http://localhost:3001';
        
        this.audioContext = null;
        this.fileBlob = null;
        this.localDb = null;
        this.micSrc = null;
        this.recorder = null;
        this.recordTimer = null;
        this.recordLimitSec = 60;
        this.recordElapsed = 0;
        this.uploadLimitSec = process.env.REACT_APP_UPLOAD_LIMIT;
        this.uploadSpin = null;
        this.userLatLng = null;
        
        this.state = {
            adminMode: false,
            adminFiles: null,
            adminUploadDone: false,
            adminUploadFailed: false,
            
            allowStop: false,
            audioUrl: null,
            
            playnow: false,
            playended: false,
            
            recording: false,
            recorded: false,
            
            stream: null,
            scaleRecord: 0,
            timeleft: 0,
            
            uploading: false,
            uploaded: false
        };
        
    }

    reset() {

        this.setState({

            audioUrl: null,
            allowStop: false,

            playnow: false,
            playended: false,

            stream: null,

            recording: false,
            recorded: false,
            recorder: null,

            uploaded: false,
            uploading: false

        });

        this.recordElapsed = 0;
        this.recordLimitSec = 60;

        this.recorder.clear();

        this.uploadSpin.kill();
    }
    
    async componentDidMount() {
        
        const inAdminMode = this.props.admin;

        // Animation to show upload work...
        this.uploadSpin = TweenMax.to('#outer-upload', 3, {
            rotation: 360,
            ease: Linear.easeNone,
            transformOrigin: 'center center',
            repeat: -1,
            paused: true
        });
        
        EventEmitter.subscribe('audiostart', () => {
            this.setState({
                playended: false
            });
        });

        EventEmitter.subscribe('audiodone', () => {
            this.setState({
                playended: true,
                playnow: false
            });
        });

        let stream;
        try {

            stream = await this.getAudioStream();

        } catch (error) {

            // Browser doesn't support audio
            console.error(error);

        }

        // Create local indexdb for fallback saves
        this.initLocalDb(inAdminMode);

        // Get location
        this.getLocation();

        // Keyboard listener (admin toggle)
        document.addEventListener("keydown", this.handleKeyDown);

        this.setState({
            stream
        });

    }

    initLocalDb(inAdminMode) {

        let req = indexedDB.open('audio');
        req.onerror = function (event) {

            console.error('Unable to open local DB', event);

        };
        req.onsuccess = async (event) => {

            this.localDb = event.target.result;

            if(inAdminMode) {
                this.retrieveBackups();
                this.setState({
                    adminMode: true
                });
            }

        };
        req.onupgradeneeded = function (event) {

            // Save the IDBDatabase interface 
            this.localDb = event.target.result;

            // Create an objectStore for this database
            let store = this.localDb.createObjectStore('files', {
                keyPath: 'id',
                autoIncrement: true
            });
            // All files get a datetime field
            store.createIndex('datetime', 'datetime', {
                unique: true
            });

        };
    }

    getAudioStream() {

        // Some browsers partially implement mediaDevices. We can't just assign an object
        // with getUserMedia as it would overwrite existing properties.
        // Here, we will just add the getUserMedia property if it's missing.
        if (navigator.mediaDevices.getUserMedia === undefined) {
            navigator.mediaDevices.getUserMedia = function (constraints) {
                // First get ahold of the legacy getUserMedia, if present
                var getUserMedia =
                    navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

                // Some browsers just don't implement it - return a rejected promise with an error
                // to keep a consistent interface
                if (!getUserMedia) {
                    return Promise.reject(
                        new Error('getUserMedia is not implemented in this browser')
                    );
                }

                // Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
                return new Promise(function (resolve, reject) {
                    getUserMedia.call(navigator, constraints, resolve, reject);
                });
            };
        }

        const params = {
            audio: true,
            video: false
        };

        return navigator.mediaDevices.getUserMedia(params);
    }

    getLocation() {
    
        if(navigator.geolocation)
            navigator.geolocation.getCurrentPosition((pos) => {
                this.userLatLng = [pos.coords.latitude, pos.coords.longitude];
            });

    }

    // Adopted from https://github.com/cwilso/volume-meter
    volumeAudioProcess(event) {
        var buf = event.inputBuffer.getChannelData(0);
        var bufLength = buf.length;
        var sum = 0;
        var x;

        // Do a root-mean-square on the samples: sum up the squares...
        for (var i = 0; i < bufLength; i++) {
            x = buf[i];
            if (Math.abs(x) >= this.clipLevel) {
                this.clipping = true;
                this.lastClip = window.performance.now();
            }
            sum += x * x;
        }

        // ... then take the square root of the sum.
        var rms = Math.sqrt(sum / bufLength);

        // Now smooth this out with the averaging factor applied
        // to the previous sample - take the max here because we
        // want "fast attack, slow release."
        let volume = Math.max(rms, this.volume * this.averaging);
        let scaleFactor = (1.1 * volume * 5.5);
        if (scaleFactor < 1) scaleFactor = 1;

        let stop = document.getElementById('stopimg');
        if (stop) stop.style.transform = 'scale(' + scaleFactor + ')';

    }

    createAudioMeter(audioContext) {

        var processor = audioContext.createScriptProcessor(2048, 1, 1);
        processor.onaudioprocess = this.volumeAudioProcess;
        processor.clipping = false;
        processor.lastClip = 0;
        processor.volume = 0;
        processor.averaging = 0.95;
        processor.clipLevel = 0.98;
        processor.clipLag = 750;

        // this will have no effect, since we don't copy the input to the output,
        // but works around a current Chrome bug.
        processor.connect(audioContext.destination);

        this.micSrc.connect(processor);

        processor.checkClipping =
            function () {
                if (!this.clipping)
                    return false;
                if ((this.lastClip + this.clipLag) < window.performance.now())
                    this.clipping = false;
                return this.clipping;
            };

        processor.shutdown =
            function () {
                this.disconnect();
                this.onaudioprocess = null;
            };

        return processor;
    }

    startRecord() {

        const {
            stream
        } = this.state;

        if (!this.recorder) {
            this.audioContext = new(window.AudioContext || window.webkitAudioContext)();
            this.micSrc = this.audioContext.createMediaStreamSource(stream);

            // console.log(audioContext)
            this.createAudioMeter(this.audioContext);
            this.recorder = new RecorderJS(this.micSrc, {workerPath: process.env.PUBLIC_URL + '/recorderWorker.js'});
            this.recorder.configure();
        }

        this.setState({
                recording: true
            },
            () => {
                TweenLite.to('#outer', this.recordLimitSec, {
                    rotation: 360,
                    transformOrigin: 'center center'
                });
                // Stop recording at specified limit
                this.recordTimer = setInterval(() => {

                    this.recordElapsed++;

                    let halftime = this.recordLimitSec * .5;
                    let quartertime = this.recordLimitSec - (this.recordLimitSec * .25);

                    if ((this.recordElapsed === halftime) || this.recordElapsed === quartertime) {
                        this.setState({
                            timeleft: this.recordLimitSec - this.recordElapsed
                        });
                        this.showTime(true);
                    }

                    if (this.recordElapsed >= this.recordLimitSec)
                        this.stopRecord();

                    // Allow stop after 2s
                    if (this.recordElapsed === 2)
                        this.setState({
                            allowStop: true
                        });

                }, 1000);

                // Start recording 
                this.recorder.record();

            }
        );

    }

    stopRecord() {

        if (!this.state.allowStop) return;

        this.recorder.stop();
        clearInterval(this.recordTimer);

        this.recorder.exportWAV((blob) => {

            let url = URL.createObjectURL(blob);
            this.fileBlob = blob;

            this.setState({
                audioUrl: url,
                recorded: true
            });

        });

    }

    showTime(autoHide) {

        TweenLite.fromTo(document.getElementById('time'), 1, {
            y: '100%',
            autoAlpha: 0
        }, {
            y: '0%',
            autoAlpha: 1,
            visibility: 'visible'
        });

        if (autoHide) {
            setTimeout(() => {
                TweenLite.to(document.getElementById('time'), 1, {
                    y: '100%',
                    autoAlpha: 0,
                    visibility: 'hidden'
                });
            }, 2500);
        }

    }

    storeBackup() {

        // Local save
        let transactionReq = this.localDb.transaction(['files'], 'readwrite')
            .objectStore('files')
            .add({
                file: this.fileBlob,
                datetime: Date.now()
            });

        transactionReq.onsuccess = function (e) {
            console.log('File saved to disk', e.result);
        };

        transactionReq.onerror = function (err) {
            console.error('File save failed', err);
        };

    }
    
    deleteBackup(id, resolve) {
        
        let tx = this.localDb.transaction(['files'], 'readwrite');
        let store = tx.objectStore('files');
        let getAllFiles = store.delete(id);

    }

    retrieveBackups(resolve) {
        
        let tx = this.localDb.transaction(['files']);
        let store = tx.objectStore('files');
        let getAllFiles = store.getAll();
        
        getAllFiles.onsuccess = () => {

            this.setState({
                adminFiles: getAllFiles.result
            });

            if(resolve)
                resolve(getAllFiles.result);

        }

    }

    async uploadBackups() {

        // Get all files
        let files = await new Promise((resolve) => this.retrieveBackups(resolve));

        // Create a promise for each file needing to be uploaded
        let promisesUpload = [];
        for (let i in files) {

            let record = files[i];
            let blob = record.file;

            promisesUpload.push(new Promise((resolve, reject) => this.upload(blob, resolve, reject, record.id)));

        }

        // TODO: Wipe local db on success
        Promise.all(promisesUpload)
        .then((responses) => { 
            responses.map(id => {
                new Promise((resolve, reject) => this.deleteBackup(id, resolve));
            });
            this.setState({adminUploadDone: true, adminUploadFailed: false});
        })
        .catch(() => { 
            this.setState({adminUploadFailed: true});            
        });

    }

    renderBackupRecords() {

        // if(!this.state.adminFiles) return;
        let { adminUploadDone, adminUploadFailed } = this.state;

        if(!this.state.adminFiles || this.state.adminFiles.length < 1) {
            return (
                <div>
                    <h2>No files found.</h2>
                </div>
            );
        }
        else {
            return (
                <div>
                <div hidden={adminUploadDone}>
                    <h2>Files in database:</h2>
                    {

                        this.state.adminFiles.map(record => {
                            if(record.file)
                            {
                                let date = dateformat(record.datetime, 'mm-d-yy h:MM:sstt');
                                let size = Math.round(record.file.size / Math.pow(1024,2));
                                return (
                                    <div key={record.id}>
                                    <span><em>Date:</em> {date}</span><br /><span><em>Size:</em> ~{size}mb</span>
                                    <hr></hr>
                                    </div>
                                );
                            }
                        })
                    }

                    <a
                        className="yellow"
                        onClick={() => { this.uploadBackups(); }}>
                            Upload All
                    </a>
                </div>
                <div hidden={!adminUploadDone}>
                    Uploads finished. Refresh to check for future recordings.
                </div>
                <div hidden={!adminUploadFailed}>
                    Uploads failed for some or all files. Make sure you have good connection.
                </div>
                </div>
            );
        }
    }

    async playStopStream() {

        this.setState({
            playnow: !this.state.playnow
        });

    }

    // fileId specified by promise call for locally stored files
    upload(customData, resolve, reject, fileId) {

        // Prevent simultaneous upload unless called by promise chain
        if (this.state.uploading && !resolve) return;

        // Controller to abort fetch, if needed and duration counter
        const controller = new AbortController(),
              signal = controller.signal;
        let fetchDuration = 0;
        let fetchTimeout;

        this.setState({
            uploading: true
        });

        let fd = new FormData();
        fd.append('file', customData ? customData : this.fileBlob);
        fd.append('datetime', Date.now());
        fd.append('latlng', this.userLatLng);

        this.uploadSpin.play();

        fetch(this.baseUrl + '/api/upload', {
                method: 'post',
                body: fd,
                signal: signal
            })
            .then((response) => {
                return response.text()
            })
            .then(() => {
                this.uploadSpin.kill();
                
                if(resolve)
                    resolve(fileId);
                else {
                    // End flow
                    clearInterval(fetchTimeout);
                    this.finish();
                }

            })
            .catch((err) => {
                console.info('Upload error; likely due to purposeful abort.');
                console.error(err);

                // Skip if called via promise
                if(resolve) return;
                
                // If there's been a problem (unreachable, signal timeout), store file locally and reset
                this.storeBackup();

                // Stop animation
                this.uploadSpin.kill();

                // End flow
                this.finish();
            });
            
            // If upload takes to long, abort, and catch will save file locally
            fetchTimeout = setInterval(() => {
                
                fetchDuration++;
                // console.log(fetchDuration, this.uploadLimitSec)
                
                if(fetchDuration >= this.uploadLimitSec)
                {
                    console.info('Upload took over ' + this.uploadLimitSec + 's, aborting and saving file to disk. Check for server errors and/or reliable connection.');

                    controller.abort();
                    fetchDuration = 0;
                    clearInterval(fetchTimeout);

                    if(reject) reject();
                }

            }, 1000);

    }

    finish() {

        // Flow finished, reset state in 10 seconds
        this.setState({
            uploaded: true,
            timeleft: 5
        });

        let resetTimer = setInterval(() => {
            let newTime = this.state.timeleft - 1;
            this.setState({
                timeleft: newTime
            });
            if (this.state.timeleft === 0) {
                clearInterval(resetTimer);
                TweenLite.to(document.getElementById('time'), 1, {
                    y: '100%',
                    autoAlpha: 0,
                    visibility: 'hidden'
                });
                this.reset();
            }
        }, 1000);

        this.showTime();

    }

    render() {

        const { adminMode, recording, recorded, playnow, playended, timeleft, uploaded, uploading } = this.state;
      
        return (
            <div>
                <div id="admin" hidden={!adminMode}>

                    <div id="localdata">
                        {this.renderBackupRecords()}
                    </div>
                </div>

            <div hidden={adminMode}>
                <h1 hidden={uploaded}>
                    <strong>
                    Recall your happiest memory walking, riding or driving through future Boston.
                    </strong>
                    <p>
                    Pay attention to the technology, people and places around you.
                    </p>
                </h1>

                <h1 hidden={!uploaded}>
                    Thanks for your submission!
                </h1>

                <h4 hidden={recorded}>You have 60 seconds for your recording.</h4>

                <div hidden={uploaded}>
                <a
                hidden={recorded}
                onClick={() => {
                    recording ? this.stopRecord() : this.startRecord();
                }}
                >
                    {
                        !recording ? 
                        
                        <img src={process.env.PUBLIC_URL + '/img/rec-btn.svg'} /> : 

                        <svg id="stopimg" width="300" height="300" fill="none" viewBox="0 0 300 300">
                            <circle id="outer" cx="150" cy="150" r="150" fill="url(#a)"/>
                            <circle cx="150" cy="150" r="118" fill="#402B59"/>
                            <path fill="#fff" d="M115.8 179.8c0-8.1-12.6-6.3-12.6-10.8 0-1.8.9-3.6 4.5-3.6s7.2 1.8 7.2 1.8v-3.6s-2.7-1.8-7.2-1.8-8.1 2.7-8.1 7.2c0 8.1 12.6 6.3 12.6 10.8 0 1.8-.9 3.6-4.5 3.6s-7.2-1.8-7.2-1.8v3.6s2.7 1.8 7.2 1.8 8.1-2.7 8.1-7.2zm8.107-18v3.6h7.2V187h3.6v-21.6h7.2v-3.6h-18zm37.793 0c-7.2 0-11.7 5.4-11.7 12.6 0 7.2 4.5 12.6 11.7 12.6 7.2 0 11.7-5.4 11.7-12.6 0-7.2-4.5-12.6-11.7-12.6zm0 3.6c4.5 0 8.1 3.6 8.1 9s-3.6 9-8.1 9-8.1-3.6-8.1-9 3.6-9 8.1-9zm30.607-3.6h-9V187h3.6v-10.8h5.4c5.4 0 8.1-2.7 8.1-7.2s-2.7-7.2-8.1-7.2zm0 10.8h-5.4v-7.2h5.4c2.7 0 4.5.9 4.5 3.6s-1.8 3.6-4.5 3.6z"/>
                            <path fill="#fff" d="M114.9 167.2l-.447.894 1.447.724V167.2h-1zm0-3.6h1v-.535l-.445-.297-.555.832zm-14.4 18l.447-.894-1.447-.724v1.618h1zm0 3.6h-1v.535l.445.297.555-.832zm16.3-5.4c0-2.333-.927-4.006-2.308-5.222-1.334-1.175-3.065-1.902-4.656-2.47-1.673-.597-3.11-1.001-4.22-1.556-1.096-.548-1.416-1.024-1.416-1.552h-2c0 1.722 1.255 2.708 2.522 3.341 1.252.627 2.965 1.123 4.442 1.651 1.559.557 2.978 1.18 4.006 2.086.982.865 1.63 2.005 1.63 3.722h2zM104.2 169c0-.746.186-1.347.607-1.768.421-.421 1.247-.832 2.893-.832v-2c-1.954 0-3.378.489-4.307 1.418-.929.929-1.193 2.128-1.193 3.182h2zm3.5-2.6c1.649 0 3.334.415 4.634.849a19.865 19.865 0 0 1 1.981.78c.049.022.085.04.108.051l.025.012.005.003h0l.447-.895.447-.895h-.001-.001l-.003-.002-.011-.005a.44.44 0 0 0-.037-.018l-.133-.064a22.213 22.213 0 0 0-2.195-.865c-1.4-.466-3.315-.951-5.266-.951v2zm8.2.8v-3.6h-2v3.6h2zm-1-3.6l.554-.832-.001-.001-.001-.001-.004-.003-.011-.007-.034-.022-.116-.07a8.021 8.021 0 0 0-.417-.232c-.358-.187-.876-.43-1.541-.672-1.328-.483-3.244-.96-5.629-.96v2c2.115 0 3.8.423 4.946.84a10.82 10.82 0 0 1 1.299.565c.144.076.251.137.318.177l.072.043.013.009s.001 0 0 0l-.001-.001h-.001v-.001l.554-.832zm-7.2-2.8c-2.443 0-4.71.733-6.383 2.149-1.69 1.43-2.717 3.511-2.717 6.051h2c0-1.96.774-3.479 2.008-4.524 1.252-1.059 3.035-1.676 5.092-1.676v-2zm-9.1 8.2c0 2.333.927 4.006 2.308 5.222 1.334 1.175 3.065 1.902 4.656 2.47 1.673.597 3.11 1.001 4.22 1.556 1.096.548 1.416 1.024 1.416 1.552h2c0-1.722-1.255-2.708-2.522-3.341-1.252-.627-2.965-1.123-4.442-1.651-1.559-.557-2.978-1.18-4.006-2.086-.982-.865-1.63-2.005-1.63-3.722h-2zm12.6 10.8c0 .746-.186 1.347-.607 1.768-.421.421-1.247.832-2.893.832v2c1.954 0 3.378-.489 4.307-1.418.929-.929 1.193-2.128 1.193-3.182h-2zm-3.5 2.6c-1.649 0-3.334-.415-4.634-.849a19.865 19.865 0 0 1-1.981-.78c-.049-.022-.085-.04-.108-.051a.423.423 0 0 0-.025-.012l-.005-.003h-.001.001l-.447.895-.447.895h.002l.003.002.011.005a.44.44 0 0 0 .037.018l.133.064a22.213 22.213 0 0 0 2.195.865c1.4.466 3.315.951 5.266.951v-2zm-8.2-.8v3.6h2v-3.6h-2zm1 3.6l-.554.832v.001l.002.001a.046.046 0 0 0 .004.003l.011.007.034.022.116.07c.098.059.237.138.417.232.358.187.876.43 1.541.672 1.328.483 3.244.96 5.629.96v-2c-2.115 0-3.799-.423-4.946-.84a10.82 10.82 0 0 1-1.299-.565 7.144 7.144 0 0 1-.318-.177l-.072-.043-.013-.009s-.001 0 0 0l.001.001h.001v.001l-.554.832zm7.2 2.8c2.443 0 4.71-.733 6.383-2.149 1.691-1.43 2.717-3.511 2.717-6.051h-2c0 1.96-.774 3.479-2.008 4.524-1.252 1.059-3.035 1.676-5.092 1.676v2zm16.207-26.2v-1h-1v1h1zm0 3.6h-1v1h1v-1zm7.2 0h1v-1h-1v1zm0 21.6h-1v1h1v-1zm3.6 0v1h1v-1h-1zm0-21.6v-1h-1v1h1zm7.2 0v1h1v-1h-1zm0-3.6h1v-1h-1v1zm-19 0v3.6h2v-3.6h-2zm1 4.6h7.2v-2h-7.2v2zm6.2-1V187h2v-21.6h-2zm1 22.6h3.6v-2h-3.6v2zm4.6-1v-21.6h-2V187h2zm-1-20.6h7.2v-2h-7.2v2zm8.2-1v-3.6h-2v3.6h2zm-1-4.6h-18v2h18v-2zm19.793 0c-3.866 0-7.067 1.458-9.293 3.931-2.216 2.462-3.407 5.864-3.407 9.669h2c0-3.395 1.059-6.293 2.893-8.331 1.824-2.027 4.473-3.269 7.807-3.269v-2zM149 174.4c0 3.805 1.191 7.207 3.407 9.669 2.226 2.473 5.427 3.931 9.293 3.931v-2c-3.334 0-5.983-1.242-7.807-3.269-1.834-2.038-2.893-4.936-2.893-8.331h-2zm12.7 13.6c3.866 0 7.067-1.458 9.293-3.931 2.216-2.462 3.407-5.864 3.407-9.669h-2c0 3.395-1.059 6.293-2.893 8.331-1.824 2.027-4.473 3.269-7.807 3.269v2zm12.7-13.6c0-3.805-1.191-7.207-3.407-9.669-2.226-2.473-5.427-3.931-9.293-3.931v2c3.334 0 5.983 1.242 7.807 3.269 1.834 2.038 2.893 4.936 2.893 8.331h2zm-12.7-8c3.879 0 7.1 3.081 7.1 8h2c0-5.881-3.979-10-9.1-10v2zm7.1 8c0 4.919-3.221 8-7.1 8v2c5.121 0 9.1-4.119 9.1-10h-2zm-7.1 8c-3.879 0-7.1-3.081-7.1-8h-2c0 5.881 3.979 10 9.1 10v-2zm-7.1-8c0-4.919 3.221-8 7.1-8v-2c-5.121 0-9.1 4.119-9.1 10h2zm28.707-12.6v-1h-1v1h1zm0 25.2h-1v1h1v-1zm3.6 0v1h1v-1h-1zm0-10.8v-1h-1v1h1zm0-3.6h-1v1h1v-1zm0-7.2v-1h-1v1h1zm5.4-4.6h-9v2h9v-2zm-10 1V187h2v-25.2h-2zm1 26.2h3.6v-2h-3.6v2zm4.6-1v-10.8h-2V187h2zm-1-9.8h5.4v-2h-5.4v2zm5.4 0c2.855 0 5.156-.714 6.751-2.175 1.607-1.474 2.349-3.572 2.349-6.025h-2c0 2.047-.608 3.549-1.701 4.55-1.105 1.014-2.854 1.65-5.399 1.65v2zm9.1-8.2c0-2.453-.742-4.551-2.349-6.025-1.595-1.461-3.896-2.175-6.751-2.175v2c2.545 0 4.294.636 5.399 1.65 1.093 1.001 1.701 2.503 1.701 4.55h2zm-9.1 2.6h-5.4v2h5.4v-2zm-4.4 1v-7.2h-2v7.2h2zm-1-6.2h5.4v-2h-5.4v2zm5.4 0c1.273 0 2.146.219 2.681.601.468.335.819.896.819 1.999h2c0-1.597-.549-2.836-1.656-3.626-1.04-.743-2.417-.974-3.844-.974v2zm3.5 2.6c0 1.103-.351 1.664-.819 1.999-.535.382-1.408.601-2.681.601v2c1.427 0 2.804-.231 3.844-.974 1.107-.79 1.656-2.029 1.656-3.626h-2z"/>
                            <path stroke="#fff" strokeWidth="4" d="M132 93h36v36h-36z"/>
                            <defs>
                                <linearGradient id="a" x1="150" x2="150" y2="300" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#402B59"/>
                                    <stop offset=".255" stopColor="#B5191D"/>
                                    <stop offset=".74" stopColor="#FCBD0B"/>
                                    <stop offset="1" stopColor="#FFD7ED"/>
                                </linearGradient>
                            </defs>
                        </svg>
                    }
                    
                </a>

                <a
                hidden={!recorded}
                onClick={() => { this.upload(); }}
                className={uploading ? 'disabled': ''}>
                   <svg width="300" height="300" fill="none" viewBox="0 0 300 300" style={{ opacity: uploading ? .5 : 1 }}>
                        <circle id="outer-upload" cx="150" cy="150" r="150" fill="url(#au)"/>
                        <circle cx="150" cy="150" r="118" fill="#FFD7ED"/>
                        <path fill="#000" d="M88.8 161.8h-3.6v15.3c0 3.6-1.8 6.3-5.4 6.3-3.6 0-5.4-2.7-5.4-6.3v-15.3h-3.6v15.3c0 5.4 2.7 9.9 9 9.9s9-4.5 9-9.9v-15.3zm19.786 0h-9V187h3.6v-10.8h5.4c5.4 0 8.1-2.7 8.1-7.2s-2.7-7.2-8.1-7.2zm0 10.8h-5.4v-7.2h5.4c2.7 0 4.5.9 4.5 3.6s-1.8 3.6-4.5 3.6zm21.593 10.8v-21.6h-3.6V187h14.4v-3.6h-10.8zm30.607-21.6c-7.2 0-11.7 5.4-11.7 12.6 0 7.2 4.5 12.6 11.7 12.6 7.2 0 11.7-5.4 11.7-12.6 0-7.2-4.5-12.6-11.7-12.6zm0 3.6c4.5 0 8.1 3.6 8.1 9s-3.6 9-8.1 9-8.1-3.6-8.1-9 3.6-9 8.1-9zM199.5 187h3.6l-9-25.2h-5.4l-9 25.2h3.6l2.556-7.2h11.088l2.556 7.2zm-12.348-10.8l4.248-11.88 4.248 11.88h-8.496zm30.355-14.4h-4.5V187h4.5c7.2 0 12.6-5.4 12.6-12.6 0-7.2-5.4-12.6-12.6-12.6zm0 21.6h-.9v-18h.9c4.5 0 9 2.7 9 9s-4.5 9-9 9z"/>
                        <path fill="#000" d="M88.8 161.8h1v-1h-1v1zm-3.6 0v-1h-1v1h1zm-10.8 0h1v-1h-1v1zm-3.6 0v-1h-1v1h1zm18-1h-3.6v2h3.6v-2zm-4.6 1v15.3h2v-15.3h-2zm0 15.3c0 1.647-.413 2.978-1.13 3.875-.694.867-1.746 1.425-3.27 1.425v2c2.076 0 3.725-.792 4.83-2.175 1.083-1.353 1.57-3.172 1.57-5.125h-2zm-4.4 5.3c-1.524 0-2.575-.558-3.27-1.425-.717-.897-1.13-2.228-1.13-3.875h-2c0 1.953.487 3.772 1.57 5.125 1.106 1.383 2.754 2.175 4.83 2.175v-2zm-4.4-5.3v-15.3h-2v15.3h2zm-1-16.3h-3.6v2h3.6v-2zm-4.6 1v15.3h2v-15.3h-2zm0 15.3c0 2.851.711 5.575 2.361 7.606C73.837 186.768 76.388 188 79.8 188v-2c-2.888 0-4.837-1.018-6.086-2.556-1.275-1.569-1.914-3.795-1.914-6.344h-2zm10 10.9c3.412 0 5.963-1.232 7.639-3.294 1.65-2.031 2.361-4.755 2.361-7.606h-2c0 2.549-.639 4.775-1.914 6.344C84.637 184.982 82.688 186 79.8 186v2zm10-10.9v-15.3h-2v15.3h2zm9.786-15.3v-1h-1v1h1zm0 25.2h-1v1h1v-1zm3.6 0v1h1v-1h-1zm0-10.8v-1h-1v1h1zm0-3.6h-1v1h1v-1zm0-7.2v-1h-1v1h1zm5.4-4.6h-9v2h9v-2zm-10 1V187h2v-25.2h-2zm1 26.2h3.6v-2h-3.6v2zm4.6-1v-10.8h-2V187h2zm-1-9.8h5.4v-2h-5.4v2zm5.4 0c2.855 0 5.156-.714 6.751-2.175 1.607-1.474 2.349-3.572 2.349-6.025h-2c0 2.047-.608 3.549-1.701 4.55-1.105 1.014-2.854 1.65-5.399 1.65v2zm9.1-8.2c0-2.453-.742-4.551-2.349-6.025-1.595-1.461-3.896-2.175-6.751-2.175v2c2.545 0 4.294.636 5.399 1.65 1.093 1.001 1.701 2.503 1.701 4.55h2zm-9.1 2.6h-5.4v2h5.4v-2zm-4.4 1v-7.2h-2v7.2h2zm-1-6.2h5.4v-2h-5.4v2zm5.4 0c1.273 0 2.146.219 2.681.601.468.335.819.896.819 1.999h2c0-1.597-.549-2.836-1.656-3.626-1.04-.743-2.417-.974-3.844-.974v2zm3.5 2.6c0 1.103-.351 1.664-.819 1.999-.535.382-1.408.601-2.681.601v2c1.427 0 2.804-.231 3.844-.974 1.107-.79 1.656-2.029 1.656-3.626h-2zm18.093 14.4h-1v1h1v-1zm0-21.6h1v-1h-1v1zm-3.6 0v-1h-1v1h1zm0 25.2h-1v1h1v-1zm14.4 0v1h1v-1h-1zm0-3.6h1v-1h-1v1zm-9.8 0v-21.6h-2v21.6h2zm-1-22.6h-3.6v2h3.6v-2zm-4.6 1V187h2v-25.2h-2zm1 26.2h14.4v-2h-14.4v2zm15.4-1v-3.6h-2v3.6h2zm-1-4.6h-10.8v2h10.8v-2zm19.807-21.6c-3.866 0-7.067 1.458-9.293 3.931-2.216 2.462-3.407 5.864-3.407 9.669h2c0-3.395 1.059-6.293 2.893-8.331 1.824-2.027 4.473-3.269 7.807-3.269v-2zm-12.7 13.6c0 3.805 1.191 7.207 3.407 9.669 2.226 2.473 5.427 3.931 9.293 3.931v-2c-3.334 0-5.983-1.242-7.807-3.269-1.834-2.038-2.893-4.936-2.893-8.331h-2zm12.7 13.6c3.866 0 7.067-1.458 9.293-3.931 2.216-2.462 3.407-5.864 3.407-9.669h-2c0 3.395-1.059 6.293-2.893 8.331-1.824 2.027-4.473 3.269-7.807 3.269v2zm12.7-13.6c0-3.805-1.191-7.207-3.407-9.669-2.226-2.473-5.427-3.931-9.293-3.931v2c3.334 0 5.983 1.242 7.807 3.269 1.834 2.038 2.893 4.936 2.893 8.331h2zm-12.7-8c3.879 0 7.1 3.081 7.1 8h2c0-5.881-3.979-10-9.1-10v2zm7.1 8c0 4.919-3.221 8-7.1 8v2c5.121 0 9.1-4.119 9.1-10h-2zm-7.1 8c-3.879 0-7.1-3.081-7.1-8h-2c0 5.881 3.979 10 9.1 10v-2zm-7.1-8c0-4.919 3.221-8 7.1-8v-2c-5.121 0-9.1 4.119-9.1 10h2zM199.5 187l-.942.335.236.665h.706v-1zm3.6 0v1h1.419l-.477-1.336-.942.336zm-9-25.2l.942-.336-.237-.664h-.705v1zm-5.4 0v-1h-.705l-.237.664.942.336zm-9 25.2l-.942-.336-.477 1.336h1.419v-1zm3.6 0v1h.706l.236-.665-.942-.335zm2.556-7.2v-1h-.706l-.236.665.942.335zm11.088 0l.942-.335-.236-.665h-.706v1zm-9.792-3.6l-.942-.337-.478 1.337h1.42v-1zm4.248-11.88l.942-.337-.942-2.633-.942 2.633.942.337zm4.248 11.88v1h1.42l-.478-1.337-.942.337zM199.5 188h3.6v-2h-3.6v2zm4.542-1.336l-9-25.2-1.884.672 9 25.2 1.884-.672zM194.1 160.8h-5.4v2h5.4v-2zm-6.342.664l-9 25.2 1.884.672 9-25.2-1.884-.672zM179.7 188h3.6v-2h-3.6v2zm4.542-.665l2.556-7.2-1.884-.67-2.556 7.2 1.884.67zm1.614-6.535h11.088v-2h-11.088v2zm10.146-.665l2.556 7.2 1.884-.67-2.556-7.2-1.884.67zm-7.908-3.598l4.248-11.88-1.884-.674-4.248 11.88 1.884.674zm2.364-11.88l4.248 11.88 1.884-.674-4.248-11.88-1.884.674zm5.19 10.543h-8.496v2h8.496v-2zm17.359-13.4v-1h-1v1h1zm0 25.2h-1v1h1v-1zm3.6-3.6h-1v1h1v-1zm0-18v-1h-1v1h1zm.9-4.6h-4.5v2h4.5v-2zm-5.5 1V187h2v-25.2h-2zm1 26.2h4.5v-2h-4.5v2zm4.5 0c7.752 0 13.6-5.848 13.6-13.6h-2c0 6.648-4.952 11.6-11.6 11.6v2zm13.6-13.6c0-7.752-5.848-13.6-13.6-13.6v2c6.648 0 11.6 4.952 11.6 11.6h2zm-13.6 8h-.9v2h.9v-2zm.1 1v-18h-2v18h2zm-1-17h.9v-2h-.9v2zm.9 0c2.062 0 4.063.62 5.533 1.893 1.446 1.254 2.467 3.216 2.467 6.107h2c0-3.409-1.229-5.947-3.158-7.618-1.905-1.652-4.404-2.382-6.842-2.382v2zm8 8c0 2.891-1.021 4.853-2.467 6.107-1.47 1.273-3.471 1.893-5.533 1.893v2c2.438 0 4.937-.73 6.842-2.382 1.929-1.671 3.158-4.209 3.158-7.618h-2z"/>
                        <path stroke="#000" strokeWidth="4" d="M130 118.097V131h40v-12.903M130 106l20-20 20 20M148.754 122V86.025"/>
                        <defs>
                            <linearGradient id="au" x1="150" x2="150" y2="300" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#402B59"/>
                                <stop offset=".255" stopColor="#B5191D"/>
                                <stop offset=".74" stopColor="#FCBD0B"/>
                                <stop offset="1" stopColor="#FFD7ED"/>
                            </linearGradient>
                        </defs>
                    </svg>
                    <div hidden={!uploading}><br />Uploading now. Thanks for your submission!</div>
                </a>

                </div>

                <div id="time" style={{visibility: 'hidden'}}>
                    {uploaded ? <span>Back to start in {timeleft}...</span> : <span>{timeleft} seconds left.</span>}
                </div>

                <p id="button" hidden={!recording || uploaded || uploading}>
                    <br />
                    <a
                    className="yellow"
                    onClick={() => { this.reset(); }}>
                        <svg width="32" height="32" fill="none" viewBox="0 0 32 32">
                            <path  stroke="#000" strokeWidth="2" d="M18.929 9l-7.071 7.071 7.07 7.071M27 16H12"/>
                            <path stroke="#000" strokeWidth="2" d="M16 1C7.716 1 1 7.716 1 16c0 8.284 6.716 15 15 15 8.284 0 15-6.716 15-15h-4"/>
                        </svg>
                        Start Over
                    </a>

                    <span hidden={!recorded}>
                        <a
                        id="playpause"
                        className="yellow"
                        onClick={() => { this.playStopStream(); }}>
                            <svg width="26" height="30" fill="none" viewBox="0 0 26 30">
                                
                            {(playnow && !playended) ? 
                            <path stroke="#000" strokeWidth="4" d="M 0.831 3.177 L 25.207 3.177 L 25.207 25.572 L 0.831 25.572 Z"></path>
                            : 
                            <path stroke="#000" strokeWidth="2" d="M 24.997 15 L 1.02 28.235 L 1.02 1.765 L 24.997 15"></path>
                            }
                                
                            </svg>
                            {(playnow && !playended) ? <span>Stop</span> : <span>Play Back</span>}
                        </a>
                    </span>
                </p>
                
                <AudioPlayerDOM src={this.state.audioUrl} hidden={true} playnow={playnow} />
         
            </div>
            </div>
        );

    }
}

export default Recorder