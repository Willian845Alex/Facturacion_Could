module.exports = function(options) {
  return {
    ...options,
    externals: [
      ...(Array.isArray(options.externals) ? options.externals : []),
      { 'pdfmake': 'commonjs pdfmake' },
      { 'pdfmake/build/pdfmake': 'commonjs pdfmake/build/pdfmake' },
      { 'pdfmake/build/vfs_fonts': 'commonjs pdfmake/build/vfs_fonts' },
      { '@foliojs-fork/fontkit': 'commonjs @foliojs-fork/fontkit' },
      { '@foliojs-fork/pdfkit': 'commonjs @foliojs-fork/pdfkit' },
    ],
  };
};