import React, {
    Component
} from 'react'
import RecorderJS from 'recorderjs';

import AudioPlayerDOM from './AudioPlayerDOM';
import { EventEmitter } from './EventEmitter';

class Recorder extends Component {
  
    constructor(props) {
        
        super(props);
        
        this.fileBlob = null;
        this.recorder = null;

        this.state = {
            audioUrl: null,
            
            playnow: false,
            playended: false,
            stream: null,

            recording: false,
            recorded: false
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

        EventEmitter.subscribe('audiodone', () => {
            this.setState({
                playended: true
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
                this.recorder.record();
            }
        );

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

    async playStream() {

        this.setState({
            playnow: true
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

        const { recording, recorded, playnow } = this.state;

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

                <p id="button" hidden={!recording}>
                    <br />
                    <a
                    className="yellow"
                    onClick={() => { this.reset(); }}>
                        <svg width="32" height="32" fill="none" viewBox="0 0 32 32">
                            <path stroke="#000" strokeWidth="2" d="M18.929 9l-7.071 7.071 7.07 7.071M27 16H12"/>
                            <path stroke="#000" strokeWidth="2" d="M16 1C7.716 1 1 7.716 1 16c0 8.284 6.716 15 15 15 8.284 0 15-6.716 15-15h-4"/>
                        </svg>
                        Start Over
                    </a>

                    <span hidden={!recorded}>
                        <a
                        className="yellow"
                        onClick={() => { this.playStream(); }}>
                            <svg width="26" height="30" fill="none" viewBox="0 0 26 30">
                                <path stroke="#000" strokeWidth="2" d="M23.943 15L1.02 28.235V1.765L23.943 15z"/>
                                <path stroke="#000" stroke-width="4" d="M132 93h36v36h-36z"/>
                            </svg>
                            Play Back
                        </a>
                    </span>
                </p>
                
                <AudioPlayerDOM src={this.state.audioUrl} hidden={true} playnow={playnow} />
         
            </div>
        );

    }
}

export default Recorder