const webpack = require('webpack');

let config = {
  entry: './src/index.js',
  output: {
    filename: 'public/js/bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /.ttf([?]?.*)$/,
        loader: 'file-loader'
      }]
  }
};

module.exports = config;