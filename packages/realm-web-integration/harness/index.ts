import puppeteer from "puppeteer";
import WebpackDevServer from "webpack-dev-server";
import webpack from "webpack";
import { MochaRemoteServer } from "mocha-remote";

import { MDBRealmWrapper } from "./MDBRealmWrapper";

import WEBPACK_CONFIG = require("../webpack.config");

const devtools = "DEV_TOOLS" in process.env;

async function run() {
    let devServer: WebpackDevServer | null = null;
    let mochaServer: MochaRemoteServer | null = null;
    let browser: puppeteer.Browser | null = null;
    let mdbRealm: MDBRealmWrapper | null = null;

    async function shutdown() {
        if (browser && !devtools) {
            await browser.close();
        }
        // Shut down the Mocha remote server
        if (mochaServer) {
            await mochaServer.stop();
        }
        // Shut down the dev server
        await new Promise(resolve =>
            devServer ? devServer.close(resolve) : resolve()
        );
        // Clean up the MongoDB Realm service
        if (mdbRealm) {
            mdbRealm.cleanup();
        }
    }

    process.once("exit", () => {
        shutdown().then(null, err => {
            // tslint:disable-next-line:no-console
            console.error(`Error shutting down: ${err}`);
        });
    });

    // Prepare
    // Create a new MongoDBRealmService
    mdbRealm = new MDBRealmWrapper();
    await mdbRealm.importApp();
    // Start up the Webpack Dev Server
    const compiler = webpack({
        ...(WEBPACK_CONFIG as webpack.Configuration),
        mode: "development",
        plugins: [
            ...WEBPACK_CONFIG.plugins,
            new webpack.DefinePlugin({
                // This must match the ID stored in ../my-test-app/stitch.json
                APP_ID: JSON.stringify(mdbRealm.getAppId())
            })
        ]
    });
    const mdbRealmBaseUrl = mdbRealm.getBaseUrl();
    await new Promise((resolve, reject) => {
        devServer = new WebpackDevServer(compiler, {
            proxy: { "/api": mdbRealmBaseUrl }
        });
        devServer.listen(8080, "localhost", err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
    // Start the mocha remote server
    mochaServer = new MochaRemoteServer();
    // Start up the browser, running the tests
    browser = await puppeteer.launch({ devtools });
    // Navigate to the pages served by the webpack dev server
    const page = await browser.newPage();
    await page.goto("http://localhost:8080");
    // Start running the remote tests
    await mochaServer.runAndStop();
}

run().then(
    () => {
        if (!devtools) {
            process.exit(0);
        }
    },
    err => {
        // tslint:disable-next-line:no-console
        console.error(err);
        if (!devtools) {
            process.exit(1);
        }
    }
);