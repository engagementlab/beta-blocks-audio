import React, { Component } from 'react';
import ReactDOM from 'react-dom';

import { EventEmitter } from './EventEmitter';

/**
 * Use case: audio player with dynamic source in react
 *
 * Usage:
 *   <AudioPlayerDOM src={this.state.currentFile}/>
 *
 * Todo: make a better api, actually pass props through
 * Todo: use children instead of passing
 */
export default class AudioPlayerDOM extends Component {

  componentDidMount() {

    const element = ReactDOM.findDOMNode(this);
    const audio = element.querySelector('audio');

    audio.onended = () => this.audioDone();
    audio.onplay = () => this.audioStart();

  }

  componentWillReceiveProps(nextProps) {

    // Find some DOM nodes
    const element = ReactDOM.findDOMNode(this);
    const audio = element.querySelector('audio');
    const source = audio.querySelector('source');

    // When the url changes, we refresh the component manually so it reloads the loaded file
    if ((nextProps.src) && (nextProps.src !== this.props.src)) {
      // Change the source
      source.src = nextProps.src;
      // Cause the audio element to load the new source
      audio.load();
    }

    // When playnow prop true, play audio
    if (nextProps.playnow !== undefined) {
      // Cause the audio element to play
      nextProps.playnow ? audio.play() : audio.pause();
    }

  }

  audioStart() {

    EventEmitter.dispatch('audiostart', null);

  }

  audioDone() {

    EventEmitter.dispatch('audiodone', null);

  }

  render() {

    return (
      <div hidden={this.props.hidden}>
        <audio autoPlay={this.props.autoplay} controls>
          <source src={this.props.src} />
        </audio>
      </div>
    );
    
  }
  
}