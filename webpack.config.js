const webpack = require('webpack');

let config = {
    entry: './src/index.js',
    output: {
        filename: 'dist/bundle.js'
    },
    module: {
        rules: [{
            test: /\.css$/,
            use: ['style-loader', 'css-loader']
        }]
    }
};

module.exports = config;