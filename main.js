const {
  Plugin,
  TFile,
  TFolder,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  Vault,
} = require("obsidian");

class TagSelectorPlugin extends Plugin {
  async onload() {
    console.log("Loading TagSelectorPlugin");
    await this.loadSettings();
    console.log("Setting loaded");
    this.addCustomStyles();
    this.addSettingTab(new TagSelectorSettingTab(this.app, this));
    this.addCommand({
      id: "select-tag",
      name: "tag-selector",
      callback: () => this.selectTag(),
    });
  }

  async loadSettings() {
    const loadedData = await this.loadData();
    console.log("loadedData:", loadedData);
    this.settings = Object.assign({}, { tagDirectoryPath: "" }, loadedData);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    new Notice("File path saved.");
  }

  onunload() {
    console.log("Unloading TagSelectorPlugin");
  }

  addCustomStyles() {
    const css = `
      .tag-node {
        cursor: pointer;
      }
      .tag-node:hover {
        background-color: #f0f0f0;
        color: #000;
      }
      .fixed-size-input {
        width: 100%;
        height: 30px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .insert-type-button {
        margin-top: 10px;
        display: block;
      }
      .insert-type-label {
        margin-top: 10px;
        display: block;
      }
    `;
    const styleElement = document.createElement("style");
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
  }

  async selectTag() {
    const files = await this.getTagFiles(this.settings.tagDirectoryPath);
    const selectedFile = await this.showFileSelectionDialog(files);
    if (selectedFile) {
      const tags = await this.getTags(selectedFile);
      if (tags.length === 0) {
        new Notice("No tags found in the selected file.");
        return;
      }
      const { tagPath, fullPath, insertFullPath } = await this.showTagSelectionDialog(tags);
      if (tagPath) {
        this.insertTagIntoActiveFile(tagPath, fullPath, insertFullPath);
      }
    }
  }

  async getTagFiles(tagDirectoryPath) {
    const files = [];
    const folder = this.app.vault.getAbstractFileByPath(tagDirectoryPath);
    if (folder instanceof TFolder) {
      Vault.recurseChildren(folder, (file) => {
        if (file instanceof TFile && file.extension === "md") {
          files.push(file.path);
        }
      });
    } else {
      console.error("Path is not a folder:", tagDirectoryPath);
    }
    return files;
  }

  async getTags(tagFilePath) {
    const file = this.app.vault.getAbstractFileByPath(tagFilePath);
    if (!(file && file instanceof TFile)) {
      new Notice("Tag file not found in the vault.");
      return [];
    }
    const content = await this.app.vault.read(file);
    return this.parseTagsFromContent(content);
  }

  parseTagsFromContent(content) {
    const lines = content.split('\n');
    const tags = [];
    const stack = [{ level: 0, children: tags, tagPath: '' }];
    lines.forEach(line => {
      const match = line.match(/^(#+)\s(.+)$/);
      if (match) {
        const level = match[1].length;
        const tag = match[2];
        const tagPath = (stack[stack.length - 1].tagPath ? stack[stack.length - 1].tagPath + '/' : '') + tag;
        const node = { tag, tagPath, children: [] };
        while (stack[stack.length - 1].level >= level) {
          stack.pop();
        }
        stack[stack.length - 1].children.push(node);
        stack.push({ level, children: node.children, tagPath });
      }
    });
    return tags;
  }

  async showFileSelectionDialog(files) {
    return new Promise((resolve) => {
      const modal = new FileSelectionModal(this.app, files, resolve);
      modal.open();
    });
  }

  async showTagSelectionDialog(tags) {
    return new Promise((resolve) => {
      const modal = new TagSelectionModal(this.app, tags, resolve);
      modal.open();
    });
  }

  async insertTagIntoActiveFile(tagPath, fullPath, insertFullPath) {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) return;
    const editor = activeLeaf.view.sourceMode.cmEditor;
    if (!editor) return;
    const tagToInsert = insertFullPath ? `#${tagPath}` : `#${tagPath.split("/").pop()}`;
    editor.replaceSelection(tagToInsert);
  }
}

class FileSelectionModal extends Modal {
  constructor(app, files, onSelect) {
    super(app);
    this.files = files;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Choose a file" });
    this.renderFiles(contentEl, this.files);
  }

  renderFiles(container, files) {
    const ul = container.createEl("ul");
    files.forEach((file) => {
      const li = ul.createEl("li");
      const span = li.createEl("span", { text:file, cls: "file-node" });
      span.onclick = () => {
        this.onSelect(file);
        this.close();
      };
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class TagSelectionModal extends Modal {
  constructor(app, tags, onSelect) {
    super(app);
    this.tags = tags;
    this.onSelect = onSelect;
    this.insertFullPath = true; // Default insert full path
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Choose a tag" });
    this.renderInsertTypeLabel(contentEl);
    this.renderTags(contentEl, this.tags);
    this.renderInsertTypeButton(contentEl);
  }

  renderTags(container, tags) {
    const ul = container.createEl("ul");
    tags.forEach((tagNode) => {
      const li = ul.createEl("li");
      const span = li.createEl("span", { text: tagNode.tag, cls: "tag-node" });
      span.onclick = () => {
        this.onSelect({ tagPath: tagNode.tagPath, insertFullPath: this.insertFullPath });
        this.close();
      };
      if (tagNode.children.length > 0) {
        this.renderTags(li, tagNode.children);
      }
    });
  }

  renderInsertTypeLabel(container) {
    this.insertTypeLabel = container.createEl("div", { text: "Current insert type: Full path", cls: "insert-type-label" });
  }

  renderInsertTypeButton(container) {
    const button = container.createEl("button", { text: "Switch Insert Type", cls: "insert-type-button" });
    button.onclick = () => {
      this.insertFullPath = !this.insertFullPath;
      this.insertTypeLabel.setText(`Current insert type: ${this.insertFullPath ? "Full path" : "Sigle tag "}`);
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class TagSelectorSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Tag Selector" });
    new Setting(containerEl)
      .setName("Tag Directory Path")
      .setDesc("Directory path where tag files are md files.")
      .addText((text) => {
        text
          .setPlaceholder("Input directory path here")
          .setValue(this.plugin.settings.tagDirectoryPath || "")
          .onChange((value) => {
            this.plugin.settings.tagDirectoryPath = value;
            console.log("Update tagDirectoryPath:", this.plugin.settings.tagDirectoryPath);
          });
        text.inputEl.classList.add("fixed-size-input");
      });
    new Setting(containerEl).addButton((button) => {
      button
        .setButtonText("Save")
        .setCta()
        .onClick(async () => {
          await this.plugin.saveSettings();
          console.log("Used button to save settings:", this.plugin.settings);
        });
    });
  }
}

module.exports = TagSelectorPlugin;

