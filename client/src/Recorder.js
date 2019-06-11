import React, {
    Component
} from 'react'

import RecorderJS from 'recorderjs';
import { TweenLite } from 'gsap';

import AudioPlayerDOM from './AudioPlayerDOM';
import { EventEmitter } from './EventEmitter';

class Recorder extends Component {
  
    constructor(props) {
        
        super(props);
        
        this.fileBlob = null;
        this.recorder = null;
        this.recordLimitSec = 20;
        this.recordElapsed = 0;

        this.state = {
            audioUrl: null,
            
            playnow: false,
            playended: false,
            
            recording: false,
            recorded: false,

            stream: null,
            timeleft: 0,
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

    async componentDidMount() {

        let stream;

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

        try {

            stream = await this.getAudioStream();

        } catch (error) {

            // Browser doesn't support audio
            console.error(error);

        }

        this.setState({
            stream
        });

    }

    startRecord() {
        
        const {
            stream
        } = this.state;

        if(!this.recorder) {
            const audioContext = new(window.AudioContext || window.webkitAudioContext)();
            const ctxSource = audioContext.createMediaStreamSource(stream);

            this.recorder = new RecorderJS(ctxSource);
        }

        this.setState({
                recording: true
            },
            () => {
                // Stop recording at specified limit
                let limiter = setInterval(() => {

                    this.recordElapsed++;

                    let halftime =  (this.recordLimitSec / 2);
                    let quartertime =  (this.recordLimitSec / 4);
                 
                    if((this.recordElapsed == halftime) || this.recordElapsed == quartertime) {
                        this.setState({
                            timeleft: this.recordLimitSec - this.recordElapsed
                        });
                        this.showTime();
                    }

                    if(this.recordElapsed >= this.recordLimitSec) {                        
                        clearInterval(limiter);
                        this.stopRecord();
                    }

                }, 1000);

                // Start recording 
                this.recorder.record();
            }
        );

    }

    showTime() {
    
        TweenLite.fromTo(document.getElementById('time'), 1, {y: '100%', autoAlpha: 0}, {y: '0%', autoAlpha: 1, visibility: 'visible'});

        setTimeout(() => {

            TweenLite.to(document.getElementById('time'), 1, {y: '100%', autoAlpha: 0, visibility: 'hidden'});

        }, 4500);

    }

    stopRecord() {
        
        this.recorder.stop();

        this.recorder.exportWAV((blob) => {

            let url = URL.createObjectURL(blob);
            this.fileBlob = blob;

            this.setState({
                audioUrl: url,
                recorded: true
            });

        });

    }

    reset() {
     
        this.setState({
            
            audioUrl: null,
            
            playnow: false,
            playended: false,

            stream: null,

            recording: false,
            recorded: false,
            recorder: null

        });  
        
        this.recorder.clear();

    }

    async playStopStream() {

        this.setState({
            playnow: !this.state.playnow
        });

    }

    async upload() {

        let fd = new FormData();
        fd.append('file', this.fileBlob);

        fetch('http://localhost:3001/api/upload', {
            method: 'post',
            body: fd
        })
        .then((response) => {
            return response.text()
            .then(data => {
                console.log('upload', typeof data);
                this.notify(data)
            })
        })
        .catch(function (err) {
            console.log(err);
        });

    }

    async notify(fileId) {

        let fd = new FormData();
        fd.append('file', this.fileBlob);

        fetch('http://localhost:3001/api/upload/' + fileId, {
            method: 'post',
            body: fd
        })
        .then(function (response) {
            console.log('notify');
            return response;
        })
        .catch(function (err) {
            console.log(err);
        });

    }

    render() {

        const { recording, recorded, playnow, playended, timeleft } = this.state;

        return (
            <div>
                <h1>
                    <strong>
                    Recall your happiest memory walking, riding or driving through future Boston.
                    </strong>
                    <p>
                    Pay attention to the technology, people and places around you.
                    </p>
                </h1>

                <a
                hidden={recorded}
                onClick={() => {
                    recording ? this.stopRecord() : this.startRecord();
                }}
                >
                    <img src={recording ? "img/stop-btn.svg" : "img/rec-btn.svg"} />
                    
                </a>

                <a
                hidden={!recorded}
                onClick={() => { this.upload(); }}>
                    <img src="img/upload-btn.svg" />
                </a>

                <div id="time" style={{visibility: 'hidden'}}>
                    {timeleft} seconds left.
                </div>

                <p id="button" hidden={!recording}>
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
        );

    }
}

export default Recorder