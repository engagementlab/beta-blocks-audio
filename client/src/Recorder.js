import React, { Component } from 'react'
import ReactDOM from 'react-dom';
import RecorderJS from 'recorderjs';
import AudioPlayerDOM from './AudioPlayerDOM';

// import * as Roundware from 'roundware-web-framework/dist/roundware';

class Recorder extends Component {

    
    constructor(props){
        super(props) 
        this.state = {
            stream: null,
            recording: false,
            recorder: null,
            roundware: null,
            audioUrl: null
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
      
        this.setState({ stream });
      }

      startRecord() {
        const { stream } = this.state;
      
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const ctxSource = audioContext.createMediaStreamSource(stream);
        
        const recorder = new RecorderJS(ctxSource);
        // recorder.init(stream);
        
        this.setState(
            {
                recorder,
                recording: true
            },
            () => {
                // recorder.start();
                recorder.record();
            }
        );
      }
      
      stopRecord() {
        const { recorder } = this.state;      
        recorder.stop();
        
        recorder.exportWAV((blob) => {

            let url = URL.createObjectURL(blob);

            const element = ReactDOM.findDOMNode(this);
            const audio = element.querySelector('audio');
            
            let fd = new FormData();
            fd.append('file', blob, 'blobby.wav');
    
            fetch('http://localhost:3001/api/upload',
              {
                method: 'post',
                body: fd
              })
            .then(function(response) {
              console.log('done');
              return response;
            })
            .catch(function(err){ 
              console.log(err);
            });
    
            
            this.setState({
                audioUrl: url
            });
            audio.load();

        });
        // console.log(blob)
        // RecorderJS.download(blob, 'test');
        
        //   console.log(data);
        //   let postRecordingMessage = "Thank you for submitting your recording! Please click OK to make another.";
        

      }

      getAudio(blob) {

        const { audioUrl } = this.state;
        
      
    }

      async playStream() {

      }

    render(){
        const { recording, stream } = this.state;

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
                onClick={() => { this.playStream(); }}>
                    Play
                </button>    
                <AudioPlayerDOM src={this.state.audioUrl} />
         
            </div>
        );
    }
}

Recorder.propTypes = {

};

export default Recorder