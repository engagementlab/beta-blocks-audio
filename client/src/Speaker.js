import React, { Component } from 'react'

import AudioPlayerDOM from './AudioPlayerDOM';
import { EventEmitter } from './EventEmitter';

import audioBufferToWav from 'audiobuffer-to-wav';

import backingTrack from './backing.mp3';

class Speaker extends Component {
    
    constructor(props){
        super(props) 

        this.soundPlayer = null;
        this.baseUrl = process.env.NODE_ENV === 'production' ? 'https://audio.betablocks.city' : 'http://localhost:3001';

        this.state = {
            isStarted: false,
            audioUrl: null,
            playlist: null,
            trackIds: [],
            trackIndex: 0
        }; 
        
        this.soundPlayer = new Audio('https://res.cloudinary.com/engagement-lab-home/video/upload/v1561565606/beta-blocks/backing.mp3');
    }

    async componentDidMount() {

        EventEmitter.subscribe('audiodone', () => {
            setTimeout(() => this.nextTrack(), 2500);
        });
    }

    updatePlaylist(callback) {
        this.soundPlayer.play();       

        fetch(this.baseUrl + '/api/list')
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

        console.log('Retrieving audio for id ' + id);

        var context = new AudioContext();
        
        fetch(this.baseUrl + '/api/download/'+id)
        .then(response => response.arrayBuffer())
        .then(buf => {

            context.decodeAudioData(buf, (buffer) => {
                // encode AudioBuffer to WAV
                var wav = audioBufferToWav(buffer)
                var blob = new Blob([ new DataView(wav) ], {
                    type: 'audio/wav'
                });
                
                let url = URL.createObjectURL(blob);            
                
                this.setState({
                    audioUrl: url,
                    isStarted: true
                });
                
            }, (err) => {
                // Skip track if bad data
                this.nextTrack();
                console.log('Unable to decode audio for id ' + id + ', skipping.');
            });

         })
        .catch(function(err){ 
            console.log(err);
        });

    }

    render(){
        return (
            <div>
                <div hidden={!this.state.isStarted}>
                    <AudioPlayerDOM autoplay={true} src={this.state.audioUrl} />
                    
                    <audio id="backing" loop={true}>
                        <source src={backingTrack} />
                    </audio>
                </div>
                
                <div 
                hidden={this.state.isStarted}>
                    <a
                        id="playpause"
                        className="yellow" 
                        onClick={() => { this.updatePlaylist(); }}>
                            <svg width="26" height="30" fill="none" viewBox="0 0 26 30">
                                <path stroke="#000" strokeWidth="2" d="M 24.997 15 L 1.02 28.235 L 1.02 1.765 L 24.997 15"></path>
                            </svg>
                             <span>Start</span>
                        </a>
                </div>
                <div 
                hidden={!this.state.isStarted}>
                    <p>Refresh to restart.</p>
                </div>
            </div>
        );
    }
}

export default Speaker