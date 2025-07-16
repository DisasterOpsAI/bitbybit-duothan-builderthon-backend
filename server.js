const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

router.get('/', (req, res) => {
  res.send('Hello World!');
});

app.use('/', router);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
