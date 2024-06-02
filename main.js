const { Plugin, TFile, TFolder, Modal, Notice, PluginSettingTab, Setting, Vault } = require('obsidian');

class TagSelectorPlugin extends Plugin {
  async onload() {
    console.log('Loading TagSelectorPlugin');

    // Load settings
    await this.loadSettings();

    console.log('Settings loaded');

    // Load tag files
    await this.loadTagFiles();

    console.log('Tag files loaded');

    // Add custom styles
    this.addCustomStyles();

    console.log('Custom styles added');

    // Add setting tab
    this.addSettingTab(new TagSelectorSettingTab(this.app, this));

    console.log('Setting tab added');

    // Add command
    this.addCommand({
      id: 'select-tag',
      name: 'Select Tag from Tag System',
      callback: () => this.selectTag(),
    });

    console.log('Command added');
  }

  async loadTagFiles() {
    if (!this.settings.tagDirectoryPath) {
      new Notice('Tag directory not set. Please set the tag directory in the plugin settings.');
      return;
    }

    const tagDirectoryPath = decodeURIComponent(this.settings.tagDirectoryPath);
    console.log('Loading tag files from directory:', tagDirectoryPath); // 添加调试语句

    try {
      const files = await this.getTagFiles(tagDirectoryPath);
      console.log('Found tag files:', files); // 添加调试语句

      this.allTags = [];

      for (const filePath of files) {
        const tags = await this.getTags(filePath);
        console.log('Tags from file', filePath, ':', tags); // 添加调试语句

        this.allTags.push(...tags);
      }

      console.log('All tags:', this.allTags); // 添加调试语句
    } catch (error) {
      console.error('Error loading tag files:', error);
    }
  }

  async getTagFiles(directoryPath) {
    const files = [];
    const folder = this.app.vault.getAbstractFileByPath(directoryPath);
  
    if (folder) {
      console.log('Abstract file found:', folder); // 添加调试语句
      if (folder instanceof TFolder) {
        console.log('Directory found:', folder); // 添加调试语句
        Vault.recurseChildren(folder, (file) => {
          if (file instanceof TFile && file.extension === 'md') {
            files.push(file.path);
          }
        });
      } else {
        console.error('The path is not a directory:', directoryPath);
      }
    } else {
      console.error('Directory not found or is not a folder:', directoryPath);
    }
  
    console.log('Files found in directory:', files); // 添加调试语句
    return files;
  }
  

  onunload() {
    console.log('Unloading TagSelectorPlugin');
  }

  addCustomStyles() {
    const css = `
    .tag-node {
      cursor: pointer;
    }
    
    .tag-node:hover {
      background-color: #f0f0f0; /* 悬停时的背景颜色 */
      color: #000; /* 悬停时的文字颜色 */
    }
    
    .fixed-size-input {
      width: 100%;
      height: 30px; /* 固定高度，可以根据需要调整 */
      overflow: hidden; /* 隐藏溢出内容 */
      white-space: nowrap; /* 不换行 */
      text-overflow: ellipsis; /* 溢出部分用省略号表示 */
    }    
    `;

    const styleElement = document.createElement('style');
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
  }

  async selectTag() {
    if (!this.allTags || this.allTags.length === 0) {
      new Notice('No tags found. Please make sure the tag directory is properly set and contains valid tag files.');
      return;
    }

    const { tagPath, fullPath } = await this.showTagSelectionDialog(this.allTags);
    if (tagPath) {
      this.insertTagIntoActiveFile(tagPath, fullPath);
    }
  }

  async getTags(tagFilePath) {
    const decodedPath = decodeURIComponent(tagFilePath);
    const file = this.app.vault.getAbstractFileByPath(decodedPath);
    if (!(file && file instanceof TFile)) {
      new Notice('Tag file not found in the vault.');
      return [];
    }
    const content = await this.app.vault.read(file);
    return this.parseTagsFromContent(content);
  }

  parseTagsFromContent(content) {
    const lines = content.split('\n');
    const tags = [];
    let currentNode = null;

    lines.forEach(line => {
        const match = line.match(/^#+\s*(.+)/);
        if (match) {
            const tagName = match[1].trim();
            const level = match[0].length;

            const tagNode = { tag: tagName, children: [] };

            if (!currentNode || level === 1) {
                // 根标签或者新的一级标签
                tags.push(tagNode);
            } else {
                // 子标签
                currentNode.children.push(tagNode);
            }

            currentNode = tagNode;
        }
    });

    return tags;
  }

  async showTagSelectionDialog(tags) {
    return new Promise((resolve) => {
      const modal = new TagSelectionModal(this.app, tags, resolve);
      modal.open();
    });
  }

  async insertTagIntoActiveFile(tagPath, fullPath) {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) return;
    const editor = activeLeaf.view.sourceMode.cmEditor;
    if (!editor) return;
    const tagToInsert = fullPath ? `#${tagPath}` : `#${tagPath.split('/').pop()}`;
    editor.replaceSelection(tagToInsert);
  }

  async loadSettings() {
    console.log('Loading settings...');
    const loadedData = await this.loadData();
    console.log('Loaded data:', loadedData);

    this.settings = Object.assign({}, { tagDirectoryPath: '' }, loadedData);
    console.log('Merged settings:', this.settings);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    new Notice('Settings saved successfully!');
  }
}

class TagSelectionModal extends Modal {
  constructor(app, tags, onSelect) {
    super(app);
    this.tags = tags;
    this.onSelect = onSelect;
    this.fullPath = true; // 默认全路径插入
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Select a Tag' });

    this.renderTags(contentEl, this.tags);
  }

  renderTags(container, tags) {
    const ul = container.createEl('ul');
    tags.forEach(tagNode => {
      const li = ul.createEl('li');
      const span = li.createEl('span', { text: tagNode.tag, cls: 'tag-node' });
      span.onclick = () => {
        this.onSelect({ tagPath: tagNode.tagPath, fullPath: this.fullPath });
        this.close();
      };
      if (tagNode.children.length > 0) {
        this.renderTags(li, tagNode.children);
      }
    });
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

    containerEl.createEl('h2', { text: 'Tag Selector Plugin Settings' });

    new Setting(containerEl)
      .setName('Tag Directory Path')
      .setDesc('The path to the directory containing tag markdown files.')
      .addText(text => {
        text
          .setPlaceholder('Enter the path to the tag directory')
          .setValue(this.plugin.settings.tagDirectoryPath || '')
          .onChange(value => {
            this.plugin.settings.tagDirectoryPath = value;
            console.log('Updated tagDirectoryPath:', this.plugin.settings.tagDirectoryPath);
          });
        text.inputEl.classList.add('fixed-size-input');
      });

    new Setting(containerEl)
      .addButton(button => {
        button
          .setButtonText('Save')
          .setCta()
          .onClick(async () => {
            await this.plugin.saveSettings();
            console.log('Settings saved via button:', this.plugin.settings);
          });
      });
  }
}

module.exports = TagSelectorPlugin;
