import React, { Component } from 'react'

import AudioPlayerDOM from './AudioPlayerDOM';
import { EventEmitter } from './EventEmitter';

import audioBufferToWav from 'audiobuffer-to-wav';

class Speaker extends Component {
    
    constructor(props){
        super(props) 
        this.state = {
            audioUrl: null,
            playlist: null,
            trackIds: [],
            trackIndex: 0
        };        
    }

    async componentDidMount() {

        this.updatePlaylist();

        EventEmitter.subscribe('audiodone', () => {
            setTimeout(() => this.nextTrack(), 500);
        });

    }

    updatePlaylist(callback) {

        fetch('http://localhost:3001/api/list')
        .then((response) => { return response.json() })
        .then((data) => { this.trackIds = data; this.startStreaming(); })
        .catch(function(err){ 
            console.log(err);
        });

    }

    nextTrack() {

        let nextInd = (this.state.trackIndex === this.trackIds.length-1) ? 0 : this.state.trackIndex+1;

        this.setState({
            trackIndex: nextInd
        });

        // If looping back to first track, refresh playlist
        if(nextInd === 0) {
            this.updatePlaylist(() => {
                this.startStreaming();
            });        
        }
        else
            this.startStreaming();
         
    }

    startStreaming() {

        if(!this.trackIds[this.state.trackIndex]) return;
        let id = this.trackIds[this.state.trackIndex]['_id']; 
        if(!id) return;

        var context = new AudioContext();

        fetch('http://localhost:3001/api/download/'+id)
        .then(response => response.arrayBuffer())
        .then(buf => {
                
            context.decodeAudioData(buf, (buffer) => 
            {
                // encode AudioBuffer to WAV
                var wav = audioBufferToWav(buffer)
                var blob = new Blob([ new DataView(wav) ], {
                    type: 'audio/wav'
                });
                
                let url = URL.createObjectURL(blob);            
                
                this.setState({
                    audioUrl: url
                });
                
              });

         })
        .catch(function(err){ 
            console.log(err);
        });

    }

    render(){
        return (
            <div>
                <AudioPlayerDOM autoplay={true} src={this.state.audioUrl} />
            </div>
        );
    }
}

export default Speaker