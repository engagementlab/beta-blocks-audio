import React from 'react';
import ReactDOM from 'react-dom';
import { Route, Link, BrowserRouter as Router } from 'react-router-dom'

import './index.css';
import Recorder from './Recorder';
import Speaker from './Speaker';
import * as serviceWorker from './serviceWorker';

// ReactDOM.render(<App />, document.getElementById('root'));
const routing = (
    <Router>
        <div>
            <Route path="/record" component={Recorder} />
            <Route path="/admin" render={(props) => <Recorder admin={true} {...props} /> } />
            <Route path="/stream" component={Speaker} />
        </div>
    </Router>
)
  
ReactDOM.render(routing, document.getElementById('root'))

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
