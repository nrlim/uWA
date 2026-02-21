const sharp = require('sharp');

sharp('public/images/new-thumbnail.png')
    .resize({ width: 1200, height: 630, fit: 'inside' })
    .jpeg({ quality: 80 })
    .toFile('public/images/new-thumbnail-optimized.jpg')
    .then(info => console.log('Optimized image info:', info))
    .catch(err => console.error('Error optimizing image:', err));
