import { dirname, join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { glob } from "glob";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import ora from "ora";
import chalk from "chalk";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const { version } = require("../package.json");

const spinner = ora(
    `Building the token list with version ${chalk.blue(version)}`
);
spinner.start();

const [rawMajor, rawMinor, rawPatch] = version.split(".");
if (!rawMajor) {
    spinner.fail(`Could not extract list major version from string ${version}`);
    process.exit(1);
}
if (!rawMinor) {
    spinner.fail(`Could not extract list minor version from string ${version}`);
    process.exit(1);
}
if (!rawPatch) {
    spinner.fail(`Could not extract list patch version from string ${version}`);
    process.exit(1);
}

const major = parseInt(rawMajor);
if (isNaN(major)) {
    spinner.fail("List major version is not a number");
    process.exit(1);
}

const minor = parseInt(rawMinor);
if (isNaN(minor)) {
    spinner.fail("List minor version is not a number");
    process.exit(1);
}

const patch = parseInt(rawPatch);
if (isNaN(patch)) {
    spinner.fail("List patch version is not a number");
    process.exit(1);
}

const AJV = new Ajv({ allErrors: true });
addFormats(AJV);
const validateTokenList = AJV.compile(
    require("@uniswap/token-lists/src/tokenlist.schema.json")
);

const getObjectValueAtPath = (object, path) => {
    const tokens = path.split("/").slice(1);
    let result = object;
    for (let token of tokens) {
        result = result[token];
    }
    return result;
};

const main = async () => {
    try {
        const matches = await glob(join(__dirname, `../tokens/*.json`));

        const tokens = matches.reduce((tokens, match) => {
            return tokens.concat(require(match));
        }, []);

        const list = {
            name: `Carrot Labs default`,
            timestamp: new Date().toISOString(),
            version: { major, minor, patch },
            tags: {},
            logoURI:
                "https://raw.githubusercontent.com/carrot-kpi/token-list/main/assets/logo.png",
            keywords: ["carrot", "default"],
            tokens: tokens.sort((t1, t2) => {
                if (t1.chainId === t2.chainId) {
                    return t1.symbol.toLowerCase() < t2.symbol.toLowerCase()
                        ? -1
                        : 1;
                }
                return t1.chainId < t2.chainId ? -1 : 1;
            }),
        };

        if (!validateTokenList(list) && validateTokenList.errors) {
            const validationErrors =
                validateTokenList.errors.reduce((memo, error) => {
                    const instancePath = error.instancePath;
                    const add = `- Value ${getObjectValueAtPath(
                        list,
                        instancePath
                    )} at path ${instancePath} ${error.message || ""}`;
                    return memo.length > 0 ? `${memo}\n${add}` : `${add}`;
                }, "") || "unknown error";
            spinner.fail(
                `Token list failed validation:\n\n${validationErrors}`
            );
            process.exit(1);
        }

        const destinationPath = join(__dirname, "../out");
        if (!existsSync(destinationPath)) mkdirSync(destinationPath);
        writeFileSync(`${destinationPath}/list.json`, JSON.stringify(list));

        spinner.succeed(`List written under ${chalk.blue(destinationPath)}`);
    } catch (error) {
        spinner.fail(`Could not build the token list:\n\n${error}`);
        process.exit(1);
    }
};

main();
