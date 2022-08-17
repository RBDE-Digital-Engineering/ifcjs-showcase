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



async function logAllSlabs(ifcManager) {
    const slabsID = await ifcManager.getAllItemsOfType(modelID, IFCSLAB);

    for (let i = 0; i <= slabsID.length; i++) {
        const slabID = slabsID[i];
        const slabProperties = await ifcManager.getItemProperties(0, slabID);
        console.log(slabProperties);
    }
}

const input = document.getElementById("file-input");

async function unloadModel() {
    for (let ifcModel of viewer.IFC.context.items.ifcModels) {
        viewer.IFC.context.getScene().remove(ifcModel)
        ifcModel = undefined
    }
    viewer.IFC.context.items.ifcModels = []
    viewer.IFC.context.items.pickableIfcModels = []
    viewer.IFC.context.scene = new IfcScene(viewer.IFC.context)
    viewer.grid.setGrid();
    viewer.axes.setAxes();

    viewer.IFC.selector = new IfcSelector(viewer.IFC.context, viewer.IFC);
}

input.addEventListener(
    "change",
    async (changed) => {
        const ifcURL = URL.createObjectURL(changed.target.files[0]);

        unloadModel()

        const model = await viewer.IFC.loadIfcUrl(ifcURL, false, (progressEvent) => console.log(progressEvent))
        console.log(model)
        modelID = model.modelID
        await viewer.shadowDropper.renderShadow(modelID)

        const ifcProject = await viewer.IFC.getSpatialStructure(modelID)
        createTreeMenu(ifcProject);
    },
    false
);


async function loadIfc(url) {
    await viewer.IFC.setWasmPath("../../../")
    const model = await viewer.IFC.loadIfcUrl(url)
    await viewer.shadowDropper.renderShadow(model.modelID)
    // await logAllSlabs(viewer.IFC.ifcManager);

    const ifcProject = await viewer.IFC.getSpatialStructure(modelID)
    createTreeMenu(ifcProject);
    await createIFCMenu(ifcProject);
}

//loads a default model

loadIfc('IFC/decomposition.ifc')

// async function pick(event) {
//     const found = cast(event)[0];
//     if (found) {
//         const index = found.faceIndex;
//         const geometry = found.object.geometry;
//         const ifc = ifcLoader.ifcManager;
//         const id = ifc.getExpressId(geometry, index);
//         const modelID = found.object.modelID;
//         const props = await ifc.getItemProperties(modelID, id);
//         output.innerHTML = JSON.stringify(props, null, 2);
//     }
// }

window.ondblclick = async () => {
    const result = await viewer.IFC.selector.highlightIfcItem()
    await viewer.IFC.selector.pickIfcItem()
    if (!result) {
        viewer.IFC.selector.unHighlightIfcItems()
        viewer.IFC.selector.unpickIfcItems()
        console.log("Unpicking picked item")
        removeAllChildren(document.getElementById("ifc-property-menu-root"))
        return
    }
    const { modelID, id } = result

    const props = await viewer.IFC.getProperties(modelID, id, true, false)
    createPropertiesMenu(props)
};

window.onmousemove = async (event) => {
    if (event.target.tagName !== "li")
        viewer.IFC.selector.prePickIfcItem();
}

async function createIFCMenu(ifcTree) {

    //Fachbereich, Objektgruppe, Untergruppe, Objekttyp
    let hierarchy = await collectFDKEntries(ifcTree.children)
    createFDKTree(hierarchy, ifcTree.children)
    console.log(hierarchy)
}

function createFDKTree(fdkTree, ifcTree) {
    let guiRoot = document.getElementById("ifc-tree-menu")
    let guiTitle = document.createElement("h2")
    guiTitle.innerText = "FDK-Struktur"
    guiRoot.append(guiTitle)
    addFDKLevels(fdkTree, guiRoot, ifcTree)
}

function addFDKLevels(fdkTree, htmlRoot, ifcTree) {
    if (!fdkTree) return
    if (htmlRoot === null) console.log(fdkTree)
    for (let level of Object.keys(fdkTree)) {
        let curdiv = document.createElement("ul")
        let curcontent = document.createElement("li")
        let text = document.createElement("span")
        text.innerText = level
        curcontent.append(text)

        if (htmlRoot.id !== "ifc-tree-menu") curdiv.classList.add("nested")
        // curdiv.classList.add("active")
        curdiv.appendChild(curcontent)

        if (fdkTree[level] !== null) {
            text.classList.add("caret");
            addFDKLevels(fdkTree[level], curcontent, ifcTree)
            text.onclick = () => {
                text.parentElement.querySelectorAll(".nested").forEach(htmlele => (text.parentElement === htmlele.parentElement)&&htmlele.classList.toggle("active"));
                text.classList.toggle("caret-down");
            }
        } else {
            text.onclick = () => {
                viewer.IFC.selector.unHighlightIfcItems()
                viewer.IFC.selector.unpickIfcItems()
                highlightFDKMatches(ifcTree, text.innerText)
            }
        }
        // text.onclick = () => {
        //     title.parentElement.querySelector(".nested").classList.toggle("active");
        //     title.classList.toggle("caret-down");
        // }
        htmlRoot.appendChild(curdiv)
    }
}

async function collectFDKEntries(elementChildren, hierarchy = {}) {
    for (let elementChild of elementChildren) {
        // TODO don't use recursive, only get exact objects for psets
        let ele_props = await viewer.IFC.getProperties(modelID, elementChild.expressID, true, true)

        // console.log(slab_props)
        for (let ele_prop_set of ele_props.psets) {
            let props = Object.fromEntries(ele_prop_set.HasProperties.map(prop => [prop.Name.value, prop.NominalValue.value]))
            // console.log(prop)

            if (
                Object.keys(props).includes("Fachbereich")
                && Object.keys(props).includes("Objektgruppe")
                && Object.keys(props).includes("Untergruppe")
                && Object.keys(props).includes("Objekttyp")
            ) {
                // let propName = prop.Name.value
                // let propValue = prop.NominalValue.value

                // check for membership in selectedObjects
                if (!hierarchy[props["Fachbereich"]]) hierarchy[props["Fachbereich"]] = {}
                if (!hierarchy[props["Fachbereich"]][props["Objektgruppe"]]) hierarchy[props["Fachbereich"]][props["Objektgruppe"]] = {}
                if (!hierarchy[props["Fachbereich"]][props["Objektgruppe"]][props["Untergruppe"]]) hierarchy[props["Fachbereich"]][props["Objektgruppe"]][props["Untergruppe"]] = {}
                if (!hierarchy[props["Fachbereich"]][props["Objektgruppe"]][props["Untergruppe"]][props["Objekttyp"]]) hierarchy[props["Fachbereich"]][props["Objektgruppe"]][props["Untergruppe"]][props["Objekttyp"]] = null
            }
        }

        if (Object.keys(hierarchy).length > 0) { }

        if (elementChild.children && elementChild.children.length > 0) hierarchy = collectFDKEntries(elementChild.children, hierarchy)
    }
    return hierarchy
}

async function highlightFDKMatches(elementChildren, fdklevel_to_match) {
    for (let elementChild of elementChildren) {
        // TODO don't use recursive, only get exact objects for psets
        let ele_props = await viewer.IFC.getProperties(modelID, elementChild.expressID, true, true)

        // console.log(slab_props)
        for (let ele_prop_set of ele_props.psets) {
            let props = Object.fromEntries(ele_prop_set.HasProperties.map(prop => [prop.Name.value, prop.NominalValue.value]))
            // console.log(prop)

            if (
                Object.keys(props).includes("Objekttyp") && props["Objekttyp"] === fdklevel_to_match
            ) {
                viewer.IFC.selector.highlightIfcItemsByID(modelID, [elementChild.expressID], false, false)
                viewer.IFC.selector.pickIfcItemsByID(modelID, [elementChild.expressID], false, false)
            }
        }

        if (elementChild.children && elementChild.children.length > 0) highlightFDKMatches(elementChild.children, fdklevel_to_match)
    }
}




const propsGUI = document.getElementById("ifc-property-menu-root");

function createPropertiesMenu(properties) {
    console.log(properties);

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

// const toggler = document.getElementsByClassName("caret");
// console.log("found ", toggler.length, "togglers")
// for (let i = 0; i < toggler.length; i++) {
//     toggler[i].onclick = () => {
//         toggler[i].parentElement.querySelector(".nested").classList.toggle("active");
//         toggler[i].classList.toggle("caret-down");
//     }
// }

// Spatial tree menu

function createTreeMenu(ifcProject) {
    const root = document.getElementById("tree-root");
    let guiTitle = document.createElement("h2")
    guiTitle.innerText = "IFC-Struktur"
    root.appendChild(guiTitle)
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
        console.log("mouse entered child")
        childNode.classList.add('hovered-child')
    }

    childNode.onmouseleave = () => {
        childNode.classList.remove("hovered-child")
    }

    childNode.onclick = async () => {
        viewer.IFC.selector.unHighlightIfcItems()
        viewer.IFC.selector.unpickIfcItems()
        viewer.IFC.selector.pickIfcItemsByID(0, [node.expressID])
        console.log("mouse clicked child")
        const props = await viewer.IFC.getProperties(modelID, node.expressID, true, false)
        createPropertiesMenu(props)
    }
}

function removeAllChildren(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}