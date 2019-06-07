import React, {
    Component
} from 'react'
import RecorderJS from 'recorderjs';
import AudioPlayerDOM from './AudioPlayerDOM';

class Recorder extends Component {

    
    constructor(props) {
        
        super(props);
        
        this.fileBlob = null;
        this.state = {
            audioUrl: null,
            
            playnow: false,
            stream: null,

            recording: false,
            recorded: false,
            recorder: null
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

        const audioContext = new(window.AudioContext || window.webkitAudioContext)();
        const ctxSource = audioContext.createMediaStreamSource(stream);

        const recorder = new RecorderJS(ctxSource);

        this.setState({
                recorder,
                recording: true
            },
            () => {
                recorder.record();
            }
        );

    }

    stopRecord() {
        
        const {
            recorder
        } = this.state;
        recorder.stop();

        recorder.exportWAV((blob) => {

            let url = URL.createObjectURL(blob);
            this.fileBlob = blob;

            this.setState({
                audioUrl: url,
                recorded: true
            });

        });

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
        .then(function (response) {
            console.log('upload');
            return response;
        })
        .catch(function (err) {
            console.log(err);
        });

    }

    render() {

        const { recording, playnow } = this.state;

        return (
            <div>
                <button
                onClick={() => {
                    recording ? this.stopRecord() : this.startRecord();
                }}
                >
                {recording ? 'Stop Recording' : 'Start Recording'}
                </button>
            
                <button
                hidden={!this.state.recorded}
                onClick={() => { this.playStream(); }}>
                    Play
                </button>
                <button
                hidden={!this.state.recorded}
                onClick={() => { this.upload(); }}>
                    Upload
                </button>
                <AudioPlayerDOM src={this.state.audioUrl} hidden={true} playnow={playnow} />
         
            </div>
        );

    }
}

export default Recorder