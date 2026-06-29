const { seedBaseData } = require('../index');

seedBaseData()
  .then(() => {
    console.log('seed complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
