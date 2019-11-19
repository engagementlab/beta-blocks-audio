// Quick and dirty code for downloading all audio clips from LFS and saving buffers as wav files

const fetch = require("node-fetch"),
      fs = require('fs');

fetch('http://localhost:3001/api/list')
.then((response) => { return response.json() })
.then((data) => { console.log(data); dlAll(data); })
.catch(function(err){ 
    console.log(err);
});

function dlAll(a) {
    a.forEach(clip => {
        
        fetch('http://localhost:3001/api/download/'+clip._id)
        .then(response => response.arrayBuffer())
        .then(buf => {

            fs.writeFileSync(__dirname + '/audio/final/' + clip._id +'.wav',  Buffer.from(new Uint8Array(buf)))
                
        });

    });
}
