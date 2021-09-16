const path = require('path');
const fs = require('fs-extra');
const parser = require('fast-xml-parser');

const defaultKeys = [
  'id',
  'name',
  'overview',
  'description',
  'developer',
  'type',
  'pageURL',
  'downloadURL',
  'downloadMirrorURL',
  'latestVersion',
  'detailURL',
  'files',
];

const typeForExtention = {
  '.auf': 'filter',
  '.aui': 'input',
  '.auo': 'output',
  '.auc': 'color',
  '.aul': 'language',
  '.anm': 'animation',
  '.obj': 'object',
  '.cam': 'camera',
  '.tra': 'track',
  '.scn': 'scene',
};

/**
 * @param {object} parsedData - A object parsed from XML.
 * @returns {Array} An array of files.
 */
function parseFiles(parsedData) {
  const files = [];
  for (const file of parsedData.files[0].file) {
    const tmpFile = {
      filename: null,
      isOptional: false,
      isDirectory: false,
      archivePath: null,
    };
    if (typeof file === 'string') {
      tmpFile.filename = file;
    } else if (typeof file === 'object') {
      tmpFile.filename = file._[0];
      if (file.$optional) tmpFile.isOptional = Boolean(file.$optional[0]);
      if (file.$directory) tmpFile.isDirectory = Boolean(file.$directory[0]);
      if (file.$archivePath) tmpFile.archivePath = file.$archivePath[0];
    } else {
      break;
    }
    Object.freeze(tmpFile);
    files.push(tmpFile);
  }
  return files;
}

/**
 *
 */
class CoreInfo {
  /**
   * Returns the core program's information.
   *
   * @param {object} parsedCore - An object parsed from XML.
   */
  constructor(parsedCore) {
    if (parsedCore.files) {
      this.files = parseFiles(parsedCore);
    }
    if (parsedCore.latestVersion) {
      if (typeof parsedCore.latestVersion[0] === 'string')
        this.latestVersion = parsedCore.latestVersion[0];
    }
    if (parsedCore.releases) {
      this.releases = {};
      const prefix = parsedCore.releases[0].$prefix[0];
      for (const fileURL of parsedCore.releases[0].fileURL) {
        this.releases[fileURL.$version[0]] = path.join(prefix, fileURL._[0]);
      }
    }
    Object.freeze(this);
  }
}

/**
 *
 */
class PackageInfo {
  /**
   * Returns the package's information.
   *
   * @param {object} parsedPackage - An object parsed from XML.
   */
  constructor(parsedPackage) {
    const keys = defaultKeys.concat('installer', 'installArg');
    for (const key of keys) {
      if (parsedPackage[key]) {
        if (key === 'files') {
          this.files = parseFiles(parsedPackage);
        } else {
          this[key] = parsedPackage[key][0];
        }
      }
    }
    const types = this.files.flatMap((f) => {
      const extention = path.extname(f.filename);
      if (extention in typeForExtention) {
        return [typeForExtention[extention]];
      } else {
        return [];
      }
    });
    this.type = [...new Set(types)];
    Object.freeze(this);
  }
}

const parseOptions = {
  attributeNamePrefix: '$',
  textNodeName: '_',
  ignoreAttributes: false,
  parseNodeValue: false,
  parseAttributeValue: false,
  trimValues: true,
  arrayMode: 'strict',
};

/**
 * An object which contains core list.
 */
class CoreList extends Object {
  /**
   *
   * @param {string} xmlPath - The path of the XML file.
   * @returns {CoreList} A list of core programs.
   */
  constructor(xmlPath) {
    super();
    const xmlData = fs.readFileSync(xmlPath, 'utf-8');
    const valid = parser.validate(xmlData);
    if (valid === true) {
      const coreInfo = parser.parse(xmlData, parseOptions);
      if (coreInfo.core) {
        for (const program of ['aviutl', 'exedit']) {
          this[program] = new CoreInfo(coreInfo.core[0][program][0]);
        }
      } else {
        throw new Error('The list is invalid.');
      }
    } else {
      throw valid;
    }
  }
}

/**
 * An object which contains packages list.
 */
class PackagesList extends Object {
  /**
   *
   * @param {string} xmlPath - The path of the XML file.
   * @returns {PackagesList} A list of packages.
   */
  constructor(xmlPath) {
    super();
    const xmlData = fs.readFileSync(xmlPath, 'utf-8');
    const valid = parser.validate(xmlData);
    if (valid === true) {
      const packagesInfo = parser.parse(xmlData, parseOptions);
      if (packagesInfo.packages) {
        for (const packageItem of packagesInfo.packages[0].package) {
          this[packageItem.id[0]] = new PackageInfo(packageItem);
        }
      } else {
        throw new Error('The list is invalid.');
      }
    } else {
      throw valid;
    }
  }
}

/**
 * An object which contains mod dates.
 */
class ModInfo extends Object {
  /**
   *
   * @param {string} xmlPath - The path of the XML file.
   * @returns {ModInfo} An object which contains mod dates.
   */
  constructor(xmlPath) {
    super();
    const xmlData = fs.readFileSync(xmlPath, 'utf-8');
    const valid = parser.validate(xmlData);
    if (valid === true) {
      const modInfo = parser.parse(xmlData, parseOptions);
      if (modInfo.mod) {
        for (const filename of ['core', 'packages_list']) {
          this[filename] = new Date(modInfo.mod[0][filename][0]);
        }
      } else {
        throw new Error('The list is invalid.');
      }
    } else {
      throw valid;
    }
  }
}

module.exports = {
  /**
   * Returns a list of core programs.
   *
   * @param {string} coreListPath - A path of xml file.
   * @returns {CoreList} A list of core programs.
   */
  getCore: function (coreListPath) {
    if (fs.existsSync(coreListPath)) {
      return new CoreList(coreListPath);
    } else {
      throw new Error('The version file does not exist.');
    }
  },

  /**
   * Returns a list of packages.
   *
   * @param {string} packagesListPath - A path of xml file.
   * @returns {PackagesList} A list of packages.
   */
  getPackages: function (packagesListPath) {
    if (fs.existsSync(packagesListPath)) {
      return new PackagesList(packagesListPath);
    } else {
      throw new Error('The version file does not exist.');
    }
  },

  /**
   * Returns an object which contains mod dates.
   *
   * @param {string} packagesListPath - A path of xml file.
   * @returns {ModInfo} An object which contains mod dates.
   */
  getMod: function (packagesListPath) {
    if (fs.existsSync(packagesListPath)) {
      return new ModInfo(packagesListPath);
    } else {
      throw new Error('The version file does not exist.');
    }
  },
};
