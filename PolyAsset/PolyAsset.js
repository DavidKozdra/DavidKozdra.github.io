/*
ToDo

load files to html document 
click to download 
add to emberlabs 
share to poly students
submitions email
automate submision acceptance and sending to emberlabs 
tags for search author for search name 
*/

const fs = require('fs');

// directory path
const dir = 'Art';

// list all files in the directory
fs.readdir(dir, (err, files) => {
    if (err) {
        throw err;
    }
    // files object contains all files names
    // log them on console
    files.forEach(file => {
        console.log(file);
        // find a way to add them to html file as objects with tags 

    });
});