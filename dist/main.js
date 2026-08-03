"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const core = __importStar(require("@actions/core"));
const rest_1 = require("@octokit/rest");
function compareVersions(a, b) {
    const aParts = a.match(/\d+/g)?.map(Number) ?? [];
    const bParts = b.match(/\d+/g)?.map(Number) ?? [];
    const length = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < length; i += 1) {
        const aPart = aParts[i] ?? 0;
        const bPart = bParts[i] ?? 0;
        if (aPart !== bPart)
            return aPart - bPart;
    }
    return a.localeCompare(b);
}
async function run() {
    const repository = core.getInput("repository");
    const token = core.getInput("token");
    const includeDrafts = core.getInput("includeDrafts").toLowerCase() === "true";
    const includePreReleases = core.getInput("includePreReleases").toLowerCase() === "true";
    const excludesPattern = core.getInput("excludes");
    const includesPattern = core.getInput("includes");
    const fallbackToTags = core.getInput("fallbackToTags").toLowerCase() === "true";
    const octokit = token ? new rest_1.Octokit({ auth: token }) : new rest_1.Octokit();
    let excludesRegex = null;
    if (excludesPattern) {
        try {
            excludesRegex = new RegExp(excludesPattern);
        }
        catch {
            core.warning(`Invalid excludes regex: ${excludesPattern}`);
        }
    }
    let includesRegex = null;
    if (includesPattern) {
        try {
            includesRegex = new RegExp(includesPattern);
        }
        catch {
            core.warning(`Invalid includes regex: ${includesPattern}`);
        }
    }
    try {
        core.debug(`Repository input: ${repository}`);
        const [owner, repo] = repository.split("/");
        core.debug(`Owner: ${owner}, Repo: ${repo}`);
        if (!owner || owner.trim() === "" || !repo || repo.trim() === "") {
            core.setFailed("Invalid repository format. Owner or repo is empty.");
            return;
        }
        const releases = await octokit.repos.listReleases({
            owner,
            repo,
        });
        core.debug(`Fetched ${releases.data.length} releases from API`);
        let data = releases.data;
        if (!includePreReleases) {
            data = data.filter((x) => x.prerelease !== true);
            core.debug(`After prerelease filter: ${data.length} releases`);
        }
        if (!includeDrafts) {
            data = data.filter((x) => x.draft !== true);
            core.debug(`After draft filter: ${data.length} releases`);
        }
        if (excludesRegex) {
            data = data.filter((x) => !excludesRegex.test(x.tag_name));
            core.info(`::debug::After excludes regex filter: ${data.length} releases`);
        }
        if (includesRegex) {
            data = data.filter((x) => includesRegex.test(x.tag_name));
            core.info(`::debug::After includes regex filter: ${data.length} releases`);
        }
        if (data.length) {
            core.debug(`Latest release: ${data[0].tag_name}`);
            core.setOutput("release", data[0].tag_name);
            core.setOutput("id", String(data[0].id));
            core.setOutput("description", String(data[0].body));
            core.setOutput("url", String(data[0].url));
            core.setOutput("assetsUrl", String(data[0].assets_url));
        }
        else if (fallbackToTags) {
            core.info("No releases found after applying filters, falling back to tags");
            const tags = await octokit.repos.listTags({
                owner,
                repo,
            });
            core.debug(`Fetched ${tags.data.length} tags from API`);
            let tagData = tags.data;
            if (excludesRegex) {
                tagData = tagData.filter((x) => !excludesRegex.test(x.name));
                core.debug(`After excludes regex filter: ${tagData.length} tags`);
            }
            if (includesRegex) {
                tagData = tagData.filter((x) => includesRegex.test(x.name));
                core.debug(`After includes regex filter: ${tagData.length} tags`);
            }
            if (tagData.length) {
                const latestTag = tagData.sort((a, b) => compareVersions(b.name, a.name))[0];
                core.debug(`Latest tag: ${latestTag.name}`);
                core.setOutput("release", latestTag.name);
                core.setOutput("id", latestTag.commit.sha);
                core.setOutput("description", "");
                core.setOutput("url", latestTag.commit.url);
                core.setOutput("assetsUrl", "");
            }
            else {
                core.setFailed("No releases or tags found after applying filters");
            }
        }
        else {
            core.setFailed("No releases found after applying filters");
        }
    }
    catch (error) {
        // Fail the workflow run if an error occurs
        if (error instanceof Error)
            core.setFailed(error.message);
    }
}
