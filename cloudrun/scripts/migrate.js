const { migrateLegacyData, seedBaseData } = require('../index');

seedBaseData()
  .then(() => migrateLegacyData())
  .then(() => {
    console.log('migration complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
