import { Color } from 'three'
import { IfcViewerAPI } from 'web-ifc-viewer'
import { IFCSLAB } from "web-ifc"
import { IFCLoader } from "web-ifc-three/IFCLoader";
import { IfcContext, IfcManager } from 'web-ifc-viewer/dist/components';
import { IfcScene } from 'web-ifc-viewer/dist/components/context/scene';
import { IfcSelector } from 'web-ifc-viewer/dist/components/ifc/selection/selector';



let modelID = 0;

const container = document.getElementById('viewer-container');
const viewer = new IfcViewerAPI({ container, backgroundColor: new Color(0xffffff) });
viewer.grid.setGrid();
viewer.axes.setAxes();

const input = document.getElementById("file-input");

async function unloadModel(){
    // remove existing models from scene
    for(let ifcModel of viewer.IFC.context.items.ifcModels){
        viewer.IFC.context.getScene().remove(ifcModel)
        ifcModel = undefined
    }
    viewer.IFC.context.items.ifcModels = []
    viewer.IFC.context.items.pickableIfcModels = []
    
    // Recreate the scene
    viewer.IFC.context.scene = new IfcScene(viewer.IFC.context)
    viewer.grid.setGrid();
    viewer.axes.setAxes();
    // Recreate the selector
    viewer.IFC.selector = new IfcSelector(viewer.IFC.context, viewer.IFC);
}

// when a new local file gets selected
input.addEventListener(
    "change",
    async (changed) => {
        // Unload any previously loaded models
        unloadModel()
        
        // Load model
        const ifcURL = URL.createObjectURL(changed.target.files[0]);
        const model = await viewer.IFC.loadIfcUrl(ifcURL, false, (progressEvent) => console.log(progressEvent))

        // Update currently active modelID
        modelID = model.modelID
        await viewer.shadowDropper.renderShadow(modelID)

        // Recreate IFC project hierarchy
        const ifcProject = await viewer.IFC.getSpatialStructure(modelID)
        createTreeMenu(ifcProject);
    },
    false
);

// Load of the inital example model
async function loadIfc(url) {
    await viewer.IFC.setWasmPath("../../../")
    const model = await viewer.IFC.loadIfcUrl(url)
    await viewer.shadowDropper.renderShadow(model.modelID)

    const ifcProject = await viewer.IFC.getSpatialStructure(modelID)
    createTreeMenu(ifcProject);
}

loadIfc('IFC/decomposition.ifc')

//doubleclicking anywhere
window.ondblclick = async () => {
    const result = await viewer.IFC.selector.highlightIfcItem()
    await viewer.IFC.selector.pickIfcItem()
    if (!result) {
        // if no model part was hit
        viewer.IFC.selector.unHighlightIfcItems()
        viewer.IFC.selector.unpickIfcItems()
        removeAllChildren(document.getElementById("ifc-property-menu-root"))
        return
    }
    // if hit, highlight model and get properties
    const { modelID, id } = result

    const props = await viewer.IFC.getProperties(modelID, id, true, false)
    createPropertiesMenu(props)
};

window.onmousemove = async (event) => {
    // highlight hovered models while not in hierarchy
    if (event.target.tagName !== "li")
        viewer.IFC.selector.prePickIfcItem();
}


const propsGUI = document.getElementById("ifc-property-menu-root");

function createPropertiesMenu(properties) {
    removeAllChildren(propsGUI);

    const psets = properties.psets;
    const mats = properties.mats;
    const type = properties.type;

    delete properties.psets;
    delete properties.mats;
    delete properties.type;

    const titleElement = document.createElement("h3");
    titleElement.textContent = type;
    propsGUI.appendChild(titleElement)

    for (let key in properties) {
        createPropertyEntry(key, properties[key]);
    }

    createPropertyEntry(psets)

}

function createPropertyEntry(key, value) {
    const propContainer = document.createElement("div");
    propContainer.classList.add("ifc-property-item");

    if (value === null || value === undefined) value = "undefined";
    else if (value.value) value = value.value;

    const keyElement = document.createElement("div");
    keyElement.textContent = key;
    propContainer.appendChild(keyElement);

    const valueElement = document.createElement("div");
    valueElement.classList.add("ifc-property-value");
    valueElement.textContent = value;
    propContainer.appendChild(valueElement);

    propsGUI.appendChild(propContainer);
}

const toggler = document.getElementsByClassName("caret");
for (let i = 0; i < toggler.length; i++) {
    toggler[i].onclick = () => {
        toggler[i].parentElement.querySelector(".nested").classList.toggle("active");
        toggler[i].classList.toggle("caret-down");
    }
}

// Spatial tree menu

function createTreeMenu(ifcProject) {
    const root = document.getElementById("tree-root");
    removeAllChildren(root);
    const ifcProjectNode = createNestedChild(root, ifcProject);
    ifcProject.children.forEach(child => {
        constructTreeMenuNode(ifcProjectNode, child);
    })
}

function nodeToString(node) {
    return `${node.type} - ${node.expressID}`
}

function constructTreeMenuNode(parent, node) {
    const children = node.children;
    if (children.length === 0) {
        createSimpleChild(parent, node);
        return;
    }
    const nodeElement = createNestedChild(parent, node);
    children.forEach(child => {
        constructTreeMenuNode(nodeElement, child);
    })
}

function createNestedChild(parent, node) {
    const content = nodeToString(node);
    const root = document.createElement('li');
    createTitle(root, content);
    const childrenContainer = document.createElement('ul');
    childrenContainer.classList.add("nested");
    root.appendChild(childrenContainer);
    parent.appendChild(root);
    return childrenContainer;
}

function createTitle(parent, content) {
    const title = document.createElement("span");
    title.classList.add("caret");
    title.onclick = () => {
        title.parentElement.querySelector(".nested").classList.toggle("active");
        title.classList.toggle("caret-down");
    }
    title.textContent = content;
    parent.appendChild(title);
}

function createSimpleChild(parent, node) {
    const content = nodeToString(node);
    const childNode = document.createElement('li');
    childNode.classList.add('leaf-node');
    childNode.textContent = content;
    parent.appendChild(childNode);

    childNode.onmouseenter = () => {
        viewer.IFC.selector.prepickIfcItemsByID(0, [node.expressID]);
        childNode.classList.add('hovered-child')
    }

    childNode.onmouseleave = () => {
        childNode.classList.remove("hovered-child")
    }

    childNode.onclick = async () => {
        viewer.IFC.selector.pickIfcItemsByID(0, [node.expressID])
        const props = await viewer.IFC.getProperties(modelID, node.expressID, true, false)
        createPropertiesMenu(props)
    }
}

function removeAllChildren(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}
