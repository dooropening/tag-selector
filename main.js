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
    await this.loadSettings();
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
    this.settings = Object.assign({}, { tagDirectoryPath: "" }, loadedData);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    new Notice("设置保存成功！");
  }

  onunload() {
    console.log("卸载 TagSelectorPlugin");
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
      const { tagPath, tagContent, insertFullPath } = await this.showTagSelectionDialog(tags);
      if (tagPath) {
        this.insertTagIntoActiveFile(tagPath, tagContent, insertFullPath);
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
      console.error("路径不是目录:", tagDirectoryPath);
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
      // const match = line.match(/^(#+)\s(.+)$/);
      const match = line.match(/^(#+)\s(.+?)(?=\s|$)/);

      if (match) {
        const level = match[1].length;
        const tag = match[2];        
        while (stack[stack.length - 1].level >= level) {
          stack.pop();
        }
        const tagPath = (stack[stack.length - 1].tagPath ? stack[stack.length - 1].tagPath + '/' : '') + tag;
        const node = { tag, tagPath, children: [] };
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

  async insertTagIntoActiveFile(tagPath, tagContent, insertFullPath) {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) return;
    const editor = activeLeaf.view.sourceMode.cmEditor;
    if (!editor) return;
    const tagToInsert = insertFullPath ? `#${tagPath}` : `#${tagContent}`;
    const cursor = editor.getCursor();
    editor.replaceRange(tagToInsert, cursor);    
    editor.setCursor(cursor.line, cursor.ch + tagToInsert.length);
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
    contentEl.createEl("h2", { text: "选择文件" });
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
    this.insertFullPath = true; // 默认插入全路径
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "选择标签" });
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
        this.onSelect({ tagPath: tagNode.tagPath, tagContent:tagNode.tag, insertFullPath: this.insertFullPath });
        this.close();
      };
      if (tagNode.children.length > 0) {
        this.renderTags(li, tagNode.children);
      }
    });
  }

  renderInsertTypeLabel(container) {
    this.insertTypeLabel = container.createEl("div", { text: "当前插入类型: 全路径", cls: "insert-type-label" });
  }

  renderInsertTypeButton(container) {
    const button = container.createEl("button", { text: "切换插入类型", cls: "insert-type-button" });
    button.onclick = () => {
      this.insertFullPath = !this.insertFullPath;
      this.insertTypeLabel.setText(`当前插入类型: ${this.insertFullPath ? "全路径" : "单项标签"}`);
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
    containerEl.createEl("h2", { text: "标签选择器插件设置" });
    new Setting(containerEl)
      .setName("标签目录路径")
      .setDesc("包含标签的 Markdown 文件的目录路径。")
      .addText((text) => {
        text
          .setPlaceholder("输入标签目录的路径")
          .setValue(this.plugin.settings.tagDirectoryPath || "")
          .onChange((value) => {
            this.plugin.settings.tagDirectoryPath = value;
          });
        text.inputEl.classList.add("fixed-size-input");
      });
    new Setting(containerEl).addButton((button) => {
      button
        .setButtonText("保存")
        .setCta()
        .onClick(async () => {
          await this.plugin.saveSettings();
        });
    });
  }
}

module.exports = TagSelectorPlugin;

