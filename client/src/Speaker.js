import React, { Component } from 'react'
import AudioPlayerDOM from './AudioPlayerDOM';

class Speaker extends Component {
    
    constructor(props){
        super(props) 
        this.state = {
            audioUrl: null,
            playlist: null
        };        
    }

    async componentDidMount() {      

        fetch('http://localhost:3001/api/list')
        .then((response) => { return response.json() })
        .then((data) => { console.log(data) })
        .catch(function(err){ 
            console.log(err);
        });

    }

    render(){
        return (
            <div>
                <AudioPlayerDOM src={this.state.audioUrl} />
            </div>
        );
    }
}

export default Speaker