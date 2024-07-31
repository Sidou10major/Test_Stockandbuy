const express = require('express');
const { Sequelize } = require('sequelize');

const app = express();
const port = 3000;

// Initialize Sequelize
const sequelize = new Sequelize('test_Qoblex', 'root', '', {
    host: 'localhost',
    dialect: 'mysql'
});

// Test the connection
sequelize.authenticate()
    .then(() => console.log('Connection has been established successfully.'))
    .catch(err => console.error('Unable to connect to the database:', err));

// Define Models
const Part = sequelize.define('Part', {
    PartId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    PartName: { type: Sequelize.STRING },
    InventoryCount: { type: Sequelize.INTEGER }
});

const Bundle = sequelize.define('Bundle', {
    BundleId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    BundleName: { type: Sequelize.STRING }
});

const BundlePart = sequelize.define('BundlePart', {
    BundlePartId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    BundleId: { type: Sequelize.INTEGER, references: { model: Bundle, key: 'BundleId' } },
    PartId: { type: Sequelize.INTEGER, references: { model: Part, key: 'PartId' } },
    Quantity: { type: Sequelize.INTEGER }
});

const SubBundle = sequelize.define('SubBundle', {
    SubBundleId: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    ParentBundleId: { type: Sequelize.INTEGER, references: { model: Bundle, key: 'BundleId' } },
    ChildBundleId: { type: Sequelize.INTEGER, references: { model: Bundle, key: 'BundleId' } },
    Quantity: { type: Sequelize.INTEGER }
});

// Define relationships
Bundle.hasMany(BundlePart, { foreignKey: 'BundleId' });
BundlePart.belongsTo(Bundle, { foreignKey: 'BundleId' });
Part.hasMany(BundlePart, { foreignKey: 'PartId' });
BundlePart.belongsTo(Part, { foreignKey: 'PartId' });

Bundle.hasMany(SubBundle, { foreignKey: 'ParentBundleId' });
SubBundle.belongsTo(Bundle, { as: 'ParentBundle', foreignKey: 'ParentBundleId' });
Bundle.hasMany(SubBundle, { foreignKey: 'ChildBundleId' });
SubBundle.belongsTo(Bundle, { as: 'ChildBundle', foreignKey: 'ChildBundleId' });

app.use(express.json());

// Define the route to compute the maximum number of bundles
app.get('/maxBundles', async (req, res) => {
    try {
        // Fetch all parts and their inventory counts
        const parts = await Part.findAll();
        const partsInventory = {};
        parts.forEach(part => {
            partsInventory[part.PartId] = part.InventoryCount;
        });

        // Function to compute the maximum number of bundles
        async function computeMaxBundles(bundleId) {
            // Fetch all BundleParts for the given bundle
            const bundleParts = await BundlePart.findAll({ where: { BundleId: bundleId } });
            let maxBundles = Infinity;

            // Check for parts requirements
            for (let bundlePart of bundleParts) {
                if (partsInventory[bundlePart.PartId] === undefined) {
                    return 0;
                }
                const possibleBundles = Math.floor(partsInventory[bundlePart.PartId] / bundlePart.Quantity);
                if (possibleBundles < maxBundles) {
                    maxBundles = possibleBundles;
                }
            }

            // Check for sub-bundles requirements
            const subBundles = await SubBundle.findAll({ where: { ParentBundleId: bundleId } });
            for (let subBundle of subBundles) {
                const possibleSubBundles = await computeMaxBundles(subBundle.ChildBundleId);
                const possibleBundles = Math.floor(possibleSubBundles / subBundle.Quantity);
                if (possibleBundles < maxBundles) {
                    maxBundles = possibleBundles;
                }
            }

            // Update inventory counts
            for (let bundlePart of bundleParts) {
                partsInventory[bundlePart.PartId] -= maxBundles * bundlePart.Quantity;
            }
            for (let subBundle of subBundles) {
                const possibleSubBundles = await computeMaxBundles(subBundle.ChildBundleId);
                await computeMaxBundles(subBundle.ChildBundleId);
                partsInventory[subBundle.ChildBundleId] -= maxBundles * subBundle.Quantity;
            }

            return maxBundles;
        }

        const maxBundles = await computeMaxBundles(1); // Assuming P0 has BundleId = 1
        res.json({ maxBundles });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sync database and start server
sequelize.sync({ force: true }).then(() => {
    console.log('Database synchronized');
}).catch(error => console.error('Error synchronizing the database:', error));
sequelize.sync({ force: true }).then(async () => {
    console.log('Database synchronized');

    // Add sample data
    const part1 = await Part.create({ PartName: 'Seat', InventoryCount: 50 });
    const part2 = await Part.create({ PartName: 'Pedal', InventoryCount: 60 });
    const part3 = await Part.create({ PartName: 'Frame', InventoryCount: 60 });
    const part4 = await Part.create({ PartName: 'Tube', InventoryCount: 35 });

    const bundleP0 = await Bundle.create({ BundleName: 'Bike' });
    const bundleP1 = await Bundle.create({ BundleName: 'Wheel' });

    await BundlePart.create({ BundleId: bundleP0.BundleId, PartId: part1.PartId, Quantity: 1 });
    await BundlePart.create({ BundleId: bundleP0.BundleId, PartId: part2.PartId, Quantity: 2 });

    await BundlePart.create({ BundleId: bundleP1.BundleId, PartId: part3.PartId, Quantity: 1 });
    await BundlePart.create({ BundleId: bundleP1.BundleId, PartId: part4.PartId, Quantity: 1 });

    await SubBundle.create({ ParentBundleId: bundleP0.BundleId, ChildBundleId: bundleP1.BundleId, Quantity: 2 });

    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}).catch(error => console.error('Error synchronizing the database:', error));
