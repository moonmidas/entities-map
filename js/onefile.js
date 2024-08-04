async function queryLLM(prompt, existingNodes, parentNode) {
    try {
      const response = await fetch('http://localhost:3000/query-llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, existingNodes, parentNode })
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const data = await response.json();
      console.log(response);
      return data.result;
    } catch (error) {
      console.error('Error querying LLM:', error);
      return '';
    }
  }
/* global getNormalizedId */
const base = 'https://en.wikipedia.org/w/api.php';

const domParser = new DOMParser();

/* Make a request to the Wikipedia API */
function queryApi(query) {
  const url = new URL(base);
  const params = { format: 'json', origin: '*', ...query };
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  return fetch(url).then(response => response.json());
}

/**
 * Get the title of a page from a URL quickly, but inaccurately (no redirects)
 */
const getPageTitleQuickly = url => url.split('/').filter(el => el).pop().split('#')[0];

/**
 * Get the name of a Wikipedia page accurately by following redirects (slow)
 */
function fetchPageTitle(page) {
  return queryApi({ action: 'query', titles: page, redirects: 1 })
    .then(res => Object.values(res.query.pages)[0].title);
}

/**
 * Decide whether the name of a wikipedia page is an article, or belongs to another namespace.
 * See https://en.wikipedia.org/wiki/Wikipedia:Namespace
 */
// Pages outside of main namespace have colons in the middle, e.g. 'WP:UA'
// Remove any trailing colons and return true if the result still contains a colon
const isArticle = name => !(name.endsWith(':') ? name.slice(0, -1) : name).includes(':');


// --- MAIN FUNCTIONS ---

/**
 * Get a DOM object for the HTML of a Wikipedia page.
 * Also returns information about any redirects that were followed.
 */
function getPageHtml(pageName) {
  return queryApi({ action: 'parse', page: pageName, prop: 'text', section: 0, redirects: 1 })
    .then(res => ({
      document: domParser.parseFromString(res.parse.text['*'], 'text/html'),
      redirectedTo: res.parse.redirects[0] ? res.parse.redirects[0].to : pageName,
    }));
}

/**
 * Get a DOM object for the first body paragraph in page HTML.
 * @param {HtmlElement} element - An HTML element as returned by `getPageHtml`
 */
const getFirstParagraph = element =>
  // First paragraph that isn't marked as "empty"...
  Array.from(element.querySelectorAll('.mw-parser-output > p:not(.mw-empty-elt)'))
    // ...and isn't the "coordinates" container
    .find(p => !p.querySelector('#coordinates'));

/**
 * Get the name of each Wikipedia article linked.
 * @param {HtmlElement} element - An HTML element as returned by `getFirstParagraph`
 */
function getWikiLinks(element) {
  const links = Array.from(element.querySelectorAll('a'))
    .map(link => link.getAttribute('href'))
    .filter(href => href && href.startsWith('/wiki/')) // Only links to Wikipedia articles
    .map(getPageTitleQuickly) // Get the title from the URL
    .filter(isArticle) // Make sure it's an article and not a part of another namespace
    .map(title => title.replace(/_/g, ' ')); // Replace underscores with spaces
  // Remove duplicates after normalizing
  const ids = links.map(getNormalizedId);
  const isUnique = ids.map((n, i) => ids.indexOf(n) === i); // 'true' in every spot that's unique
  return links.filter((n, i) => isUnique[i]);
}

/**
 * Given a page title, get the first paragraph links, as well as the name of the page it redirected
 * to.
 */
// function getSubPages(pageName) {
//   return getPageHtml(pageName).then(({ document: doc, redirectedTo }) => ({
//     redirectedTo,
//     links: getWikiLinks(getFirstParagraph(doc)),
//   }));
// }

async function getSubPages(pageName) {
    const existingNodes = nodes.get().map(node => node.label);
    const parentNode = pageName;
    const prompt = `${pageName}`;
    const response = await queryLLM(prompt, existingNodes, parentNode);
    const links = response.split('\n').map(item => {
      const [entity, strength, relatedNodes] = item.trim().split('|');
      const relatedNodesMap = relatedNodes ? relatedNodes.split(',').reduce((acc, rel) => {
        const [node, str] = rel.split(':');
        acc[node] = parseFloat(str);
        return acc;
      }, {}) : {};
      return { entity, strength: parseFloat(strength), relatedNodes: relatedNodesMap };
    }).filter(item => item.entity);
    return {
      redirectedTo: pageName,
      links: links
    };
  }

/**
 * Get the name of a random Wikipedia article
 */
// function getRandomArticle() {
//   return queryApi({
//     action: 'query',
//     list: 'random',
//     rnlimit: 1,
//     rnnamespace: 0, // Limits results to articles
//   }).then(res => res.query.random[0].title);
// }
async function getRandomArticle() {
    const prompt = "Generate a random interesting topic.";
    const response = await queryLLM(prompt);
    return response.split('\n')[0].trim();
  }

/**
 * Get completion suggestions for a query
 */
// function getSuggestions(search) {
//   return queryApi({
//     action: 'opensearch',
//     search,
//     limit: 10,
//     namespace: 0, // Limits results to articles
//   })
//     .then(res => res[1]);
// }
async function getSuggestions(search) {
    const prompt = `Generate 5 topic suggestions related to "${search}".`;
    const response = await queryLLM(prompt);
    return response.split('\n').map(item => item.trim()).filter(item => item);
  }

// HELPERS
/* global vis, network, nodes, edges */
// This script contains helper functions that are used by other scripts to
// perform simple common actions.


// -- MISCELLANEOUS FUNCTIONS -- //

// Get the level of the highest level node that exists in the graph
function maxLevel() {
    const ids = nodes.getIds();
    const levels = ids.map(x => nodes.get(x).level);
    return Math.max.apply(null, levels);
  }
  
  // Convert a hex value to RGB
  function hexToRGB(hex) {
    // eslint-disable-next-line no-param-reassign
    if (hex.startsWith('#')) hex = hex.slice(1, hex.length); // Remove leading #
    const strips = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)]; // Cut up into 2-digit strips
    return strips.map(x => parseInt(x, 16)); // To RGB
  }
  function rgbToHex(rgb) {
    const hexvals = rgb
      .map(x => Math.round(x).toString(16))
      .map(x => (x.length === 1 ? `0${x}` : x));
    // Add leading 0s to make a valid 6 digit hex
    return `#${hexvals.join('')}`;
  }
  
  // Lighten a given hex color by %
  function lightenHex(hex, percent) {
    const rgb = hexToRGB(hex); // Convert to RGB
    const newRgb = rgb.map(x => x + ((Math.min(percent, 100) / 100) * (255 - x)));
    return rgbToHex(newRgb); // and back to hex
  }
  // Get the color for a node, lighten a blue based on level. Subtle.
  function getColor(level) {
    return lightenHex('#03A9F4', 5 * level); // Gets 5% lighter for each level
  }
  // Get the highlighted color for a node, lighten a yellow based on level. Subtle.
  function getYellowColor(level) {
    return lightenHex('#FFC107', 5 * level); // Gets 5% lighter for each level
  }
  // Get the color that an edge should be pointing to a certain level
  function getEdgeColor(level) {
    const nodecolor = getColor(level);
    return vis.util.parseColor(nodecolor).border;
  }
  
  
  // Break a sentence into separate lines, trying to fit each line within `limit`
  // characters. Only break at spaces, never break in the middle of words.
  function wordwrap(text, limit) {
    const words = text.split(' ');
    const lines = [words[0]];
    words.slice(1).forEach((word) => {
      // Start a new line if adding this word to the previous line would overflow character limit
      if (lines[lines.length - 1].length + word.length > limit) lines.push(word);
      else lines[lines.length - 1] += ` ${word}`;
    });
    return lines.join('\n'); // Trim because the first line will start with a space
  }
  // Un-word wrap a sentence by replacing line breaks with spaces.
  function unwrap(text) { return text.replace(/\n/g, ' '); }
  
  // Get a "normalized" form of a page name to use as an ID. This is designed to
  // minimize the number of duplicate nodes found in the network.
  function getNormalizedId(id) {
    return id
      .toLowerCase() // Lowercase
      .replace(/\s+/g, ' ') // Reduce spaces
      .replace(/[^A-Za-z\d% ]/g, '') // Remove non-alphanumeric characters
      .replace(/s$/, ''); // Remove trailing s
  }
  
  // A cross-browser compatible alternative to Math.sign, because support is atrocious
  function sign(x) {
    if (x === 0) return 0;
    return x > 0 ? 1 : -1;
  }
  
  
  // == NETWORK SHORTCUTS == //
  
  // Color nodes from a list based on their level. If color=1, highlight color will be used.
  function colorNodes(ns, color) {
    const colorFunc = color ? getYellowColor : getColor;
  
    for (let i = 0; i < ns.length; i += 1) {
      ns[i].color = colorFunc(ns[i].level);
      // Prevent snapping
      delete ns[i].x;
      delete ns[i].y;
    }
    nodes.update(ns);
    window.isReset = false;
  }
  
  // Set the width of some edges.
  function edgesWidth(es, width) {
    for (let i = 0; i < es.length; i += 1) {
      es[i].width = width;
    }
    edges.update(es);
    window.isReset = false;
  }
  
  // Get the id of the edge connecting two nodes a and b
  function getEdgeConnecting(a, b) {
    const edge = edges.get({
      filter: e => e.from === a && e.to === b,
    })[0];
  
    return (edge instanceof Object ? edge : {}).id;
  }
  
  // Get the network's center of gravity
  function getCenter() {
    const nodePositions = network.getPositions();
    const keys = Object.keys(nodePositions);
  
    // Find the sum of all x and y values
    let xsum = 0; let ysum = 0;
  
    Object.values(nodePositions).forEach((pos) => {
      xsum += pos.x;
      ysum += pos.y;
    });
  
    return [xsum / keys.length, ysum / keys.length]; // Average is sum divided by length
  }
  
  // Get the position in which nodes should be spawned given the id of a parent node.
  // This position is in place so that nodes begin outside the network instead of at the center,
  // leading to less chaotic node openings in large networks.
  function getSpawnPosition(parentID) {
    // Get position of the node with specified id.
    const { x, y } = network.getPositions(parentID)[parentID];
    const cog = getCenter();
    // Distances from center of gravity to parent node
    const dx = cog[0] - x; const dy = cog[1] - y;
  
    let relSpawnX; let relSpawnY;
  
    if (dx === 0) { // Node is directly above center of gravity or on it, so slope will fail.
      relSpawnX = 0;
      relSpawnY = -sign(dy) * 100;
    } else {
      // Compute slope
      const slope = dy / dx;
      // Compute the new node position.
      const dis = 200; // Distance from parent (keep equal to network.options.physics.springLength)
      relSpawnX = dis / Math.sqrt((slope ** 2) + 1);
      relSpawnY = relSpawnX * slope;
    }
    return [Math.round(relSpawnX + x), Math.round(relSpawnY + y)];
  }

  // MAIN FUNCTIONS

  /* global nodes, edges, getSpawnPosition, getNormalizedId, wordwrap, unwrap, getColor, getEdgeColor, getEdgeConnecting, getSubPages, colorNodes, edgesWidth */ // eslint-disable-line max-len
// This script contains the big functions that implement a lot of the core
// functionality, like expanding nodes, and getting the nodes for a traceback.


// -- GLOBAL VARIABLES -- //
window.isReset = true;
window.selectedNode = null;
window.traceedges = [];
window.tracenodes = [];
// ---------------------- //


// Rename a node, possibly merging it with another node if another node has that ID
function renameNode(oldId, newName) {
  const oldNode = nodes.get(oldId);
  const newId = getNormalizedId(newName);
  // The node doesn't need to be renamed
  if (newId === oldId) return oldId;
  // The node needs to be renamed - the new name doesn't exist on the graph yet.
  edges.update([
    // Update all edges that were 'from' oldId to be 'from' newId
    ...edges.get({
      filter: e => e.from === oldId,
    }).map(e => ({ ...e, from: newId })),
    // Update all edges that were 'to' oldId to be 'to' newId
    ...edges.get({
      filter: e => e.to === oldId,
    }).map(e => ({ ...e, to: newId })),
  ]);
  // The node already exists! We're just merging it
  if (nodes.get(newId)) {
    nodes.remove(oldId);
    nodes.update({ id: newId, label: newName });
    console.log(`Merging ${oldId} with ${newId}`);
    // We're actually replacing the node
  } else {
    console.log(`Re-identifying ${oldId} as ${newId}`);
    nodes.remove(oldId);
    nodes.add({ ...oldNode, id: newId, label: wordwrap(newName, oldNode.level === 0 ? 20 : 15) });
  }
  // Update any nodes whose parent was the old node
  nodes.update(
    nodes.get({
      filter: n => n.parent === oldId,
    }).map(n => ({ ...n, parent: newId })),
  );
  // If the old node was highlighted or used as part of a highlight, move the highlight
  if (window.selectedNode === oldId) window.selectedNode = newId;
  window.tracenodes = window.tracenodes.map(id => (id === oldId ? newId : id));
  // If the node was a start node, replace it
  window.startpages = window.startpages.map(id => (id === oldId ? newId : id));
  // Return the new ID
  return newId;
}

// Callback to add to a node once data is recieved
// function expandNodeCallback(page, data) {
//   const node = nodes.get(page); // The node that was clicked
//   const level = node.level + 1; // Level for new nodes is one more than parent
//   const subpages = data;

//   // Add all children to network
//   const subnodes = [];
//   const newedges = [];
//   // Where new nodes should be spawned
//   const [x, y] = getSpawnPosition(page);
//   // Create node objects
//   for (let i = 0; i < subpages.length; i += 1) {
//     const subpage = subpages[i];
//     const subpageID = getNormalizedId(subpage);
//     if (!nodes.getIds().includes(subpageID)) { // Don't add if node exists
//       subnodes.push({
//         id: subpageID,
//         label: wordwrap(decodeURIComponent(subpage), 15),
//         value: 1,
//         level,
//         color: getColor(level),
//         parent: page,
//         x,
//         y,
//       });
//     }

//     if (!getEdgeConnecting(page, subpageID)) { // Don't create duplicate edges in same direction
//       newedges.push({
//         from: page,
//         to: subpageID,
//         color: getEdgeColor(level),
//         level,
//         selectionWidth: 2,
//         hoverWidth: 0,
//       });
//     }
//   }

//   // Add the new components to the datasets for the graph
//   nodes.add(subnodes);
//   edges.add(newedges);
// }

function expandNodeCallback(page, data) {
    const node = nodes.get(page);
    const level = node.level + 1;
    const subpages = data;
  
    const subnodes = [];
    const newedges = [];
    const [x, y] = getSpawnPosition(page);
  
    subpages.forEach(subpage => {
      const subpageID = getNormalizedId(subpage.entity);
      if (!nodes.getIds().includes(subpageID)) {
        subnodes.push({
          id: subpageID,
          label: wordwrap(subpage.entity, 15),
          value: 1,
          level,
          color: getColor(level),
          parent: page,
          x,
          y,
        });
      }
  
      if (!getEdgeConnecting(page, subpageID)) {
        newedges.push({
          from: page,
          to: subpageID,
          color: getEdgeColorByStrength(subpage.strength),
          level,
          selectionWidth: 2,
          hoverWidth: 0,
          strength: subpage.strength
        });
      }
  
      // Add edges for related nodes, excluding the parent
      Object.entries(subpage.relatedNodes).forEach(([relatedNode, strength]) => {
        const relatedNodeID = getNormalizedId(relatedNode);
        if (relatedNodeID !== page && nodes.getIds().includes(relatedNodeID) && !getEdgeConnecting(subpageID, relatedNodeID)) {
          newedges.push({
            from: subpageID,
            to: relatedNodeID,
            color: getEdgeColorByStrength(strength),
            level: Math.min(nodes.get(relatedNodeID).level, level),
            selectionWidth: 2,
            hoverWidth: 0,
            strength: strength
          });
        }
      });
    });
  
    nodes.add(subnodes);
    edges.add(newedges);
  }

// 
function getEdgeColorByStrength(strength) {
    // Interpolate between red (weak) and green (strong)
    const r = Math.round(255 * (1 - strength));
    const g = Math.round(255 * strength);
    return `rgb(${r},${g},0)`;
}

// Expand a node without freezing other stuff
function expandNode(id) {
    const pagename = unwrap(nodes.get(id).label);
    getSubPages(pagename).then(({ redirectedTo, links }) => {
      const newId = renameNode(id, redirectedTo);
      expandNodeCallback(newId, links);
      // Mark the node as expanded
      nodes.update({ id: newId, expanded: true });
    });
    // Mark the expanded node as 'locked' if it's one of the commafield items
    const cf = document.getElementById('input');
    const cfItem = cf.querySelector(`.item[data-node-id="${id}"]`);
    if (cfItem) cfItem.classList.add('locked');
  }

// Get all the nodes tracing back to the start node.
function getTraceBackNodes(node) {
  let currentNode = node;
  let finished = false;
  let iterations = 0;
  const path = [];
  while (!finished) { // Add parents of nodes until we reach the start
    path.push(currentNode);
    if (window.startpages.indexOf(currentNode) !== -1) { // Check if we've reached the end
      finished = true;
    }
    currentNode = nodes.get(currentNode).parent; // Keep exploring with the node above.
    // Failsafe: avoid infinite loops in case something got messed up with parents in the graph
    if (iterations > 100) return [];
    iterations += 1;
  }
  return path;
}

// Get all the edges tracing back to the start node.
function getTraceBackEdges(tbnodes) {
  tbnodes.reverse();
  const path = [];
  for (let i = 0; i < tbnodes.length - 1; i += 1) { // Don't iterate through the last node
    path.push(getEdgeConnecting(tbnodes[i], tbnodes[i + 1]));
  }
  return path;
}

// Reset the color of all nodes, and width of all edges.
function resetProperties() {
  if (!window.isReset) {
    window.selectedNode = null;
    // Reset node color
    const modnodes = window.tracenodes.map(i => nodes.get(i));
    colorNodes(modnodes, 0);
    // Reset edge width and color
    const modedges = window.traceedges.map((i) => {
      const e = edges.get(i);
      e.color = getEdgeColor(nodes.get(e.to).level);
      return e;
    });
    edgesWidth(modedges, 1);
    window.tracenodes = [];
    window.traceedges = [];
  }
}

// Highlight the path from a given node back to the central node.
function traceBack(node) {
  if (node !== window.selectedNode) {
    resetProperties();
    window.selectedNode = node;
    window.tracenodes = getTraceBackNodes(node);
    window.traceedges = getTraceBackEdges(window.tracenodes);
    // Color nodes yellow
    const modnodes = window.tracenodes.map(i => nodes.get(i));
    colorNodes(modnodes, 1);
    // Widen edges
    const modedges = window.traceedges.map((i) => {
      const e = edges.get(i);
      e.color = { inherit: 'to' };
      return e;
    });
    edgesWidth(modedges, 5);
  }
}

// HELP
/* global Shepherd */
const isTouchDevice = 'd' in document.documentElement;

// Create the Shepherd tour

const buttons = document.getElementById('buttons');
const formbox = document.getElementById('formbox');

const shepherd = new Shepherd.Tour({
  defaults: {
    classes: 'shepherd-theme-arrows',
    showCancelLink: true,
  },
});

// Add steps to the Shepherd tour.

shepherd.addStep({
  text: [
    'Input the name of a Wikipedia article here.',
    'You can compare multiple topics by pressing <kbd>,</kbd> ' +
    '<kbd>Tab</kbd> or <kbd>Enter</kbd> after each one.',
  ],
  attachTo: '#input bottom',
  buttons: [
    {
      text: 'Back',
      classes: 'shepherd-button-secondary',
      action: shepherd.back,
    },
    {
      text: 'Next',
      classes: 'shepbtn',
      action: shepherd.next,
    },
  ],
});

shepherd.addStep({
  text: [
    "Once you're done, submit your query.",
    'Wikipedia Map will create a node for each input topic.',
  ],
  attachTo: '#submit bottom',
  buttons: [
    {
      text: 'Back',
      classes: 'shepherd-button-secondary',
      action: shepherd.back,
    },
    {
      text: 'Next',
      classes: 'shepbtn',
      action: shepherd.next,
    },
  ],
  tetherOptions: {
    attachment: 'top left',
    targetAttachment: 'bottom center',
    offset: '0px -35px',
  },
});

shepherd.addStep({
  text: [
    'Click a node to expand it.',
    'Expanding a node creates a new node for each Wikipedia article linked in the first paragraph of the article whose node you clicked.',
    '<img src="https://images.prismic.io/luke/db049805-b070-43c5-a412-d44c5ac3a4d7_wikipedia-expand.gif" alt="Expanding a Wikipedia Map node" style="width: 410px; height: 410px;" />',
  ],
  buttons: [
    {
      text: 'Back',
      classes: 'shepherd-button-secondary',
      action: shepherd.back,
    },
    {
      text: 'Next',
      classes: 'shepbtn',
      action: shepherd.next,
    },
  ],
});

shepherd.addStep({
  text: [
    'Keep expanding nodes to build a map and connect topics!',
  ],
  buttons: [
    {
      text: 'Back',
      classes: 'shepherd-button-secondary',
      action: shepherd.back,
    },
    {
      text: "Let's go!",
      classes: 'shepbtn',
      action: shepherd.next,
    },
  ],
});

// Take away the info box when the tour has started...
shepherd.on('start', () => {
  document.getElementById('container').style.opacity = 0.3;
  document.getElementById('container').style.pointerEvents = 'none';
  formbox.style.opacity = 0.3;
  buttons.style.opacity = 0.3;
});

// ... and bring it back when the tour goes away
function opaque() {
  document.getElementById('container').style.opacity = '';
  document.getElementById('container').style.pointerEvents = '';
  formbox.style.opacity = 1;
  buttons.style.opacity = 1;
}
shepherd.on('complete', () => {
  opaque();
  document.querySelector('#input input').focus();
});
shepherd.on('cancel', opaque);

// Prompt user for input when none detected
function noInputDetected() {
  document.getElementById('container').style.opacity = 0.3;
  buttons.style.opacity = 0.3;
  shepherd.show();
}

// MAIN
/* global vis, bindNetwork, getNormalizedId, wordwrap, getColor, noInputDetected, getItems, addItem, clearItems, unlockAll, fetchPageTitle, getRandomArticle, networkFromJson */ // eslint-disable-line max-len
// This script contains the code that creates the central network, as well as
// a function for resetting it to a brand new page.


let nodes;
let edges;
let network; // Global variables

window.startpages = [];
// Tracks whether the network needs to be reset. Used to prevent deleting nodes
// when multiple nodes need to be created, because AJAX requests are async.

const container = document.getElementById('container');
// Global options
const options = {
  nodes: {
    shape: 'dot',
    scaling: {
      min: 20,
      max: 30,
      label: { min: 14, max: 30, drawThreshold: 9, maxVisible: 20 },
    },
    font: { size: 14, face: getComputedStyle(document.body).fontFamily },
  },
  interaction: {
    hover: true,
    hoverConnectedEdges: false,
    selectConnectedEdges: true,
  },
};

nodes = new vis.DataSet();
edges = new vis.DataSet();
let data = { nodes, edges };
let initialized = false;


// Set up the network
function makeNetwork() {
  if (initialized) throw new Error('Network is already initialized');
  network = new vis.Network(container, data, options);
  bindNetwork();

  window.startpages = [];
  window.tracenodes = [];
  window.traceedges = [];
  nodes = new vis.DataSet();
  edges = new vis.DataSet();
  data = { nodes, edges };
  network.setData(data);

  initialized = true;
}

// Get the object to represent a "start node" for a given page name
const getStartNode = pageName => ({
  id: getNormalizedId(pageName),
  label: wordwrap(decodeURIComponent(pageName), 20),
  value: 2,
  level: 0,
  color: getColor(0),
  x: 0,
  y: 0,
  parent: getNormalizedId(pageName), // Parent is self
});

// Reset everything to its initial state
function clearNetwork() {
  window.startpages = [];
  window.tracenodes = [];
  window.traceedges = [];
  nodes = new vis.DataSet();
  edges = new vis.DataSet();
  data = { nodes, edges };
  network.setData(data);

  const cf = document.getElementById('input');
  unlockAll(cf);
}

// Add and remove "start nodes" to make the list of start nodes match the list passed
function setStartPages(starts) {
  const newStartPages = starts.map(getNormalizedId);
  if (!initialized) makeNetwork();
  const toRemove = window.startpages.filter(id => !newStartPages.includes(id));
  const toAdd = starts.filter((pageName, i) => !window.startpages.includes(newStartPages[i]));

  nodes.remove(toRemove);
  nodes.add(toAdd.map(getStartNode));
  window.startpages = newStartPages;
}


// Reset the network with the content from the input box.
function go() {
  // Get items entered
  const cf = document.getElementById('input');
  const inputs = getItems(cf);
  // If no input is given, prompt user to enter articles
  if (!inputs[0]) {
    noInputDetected();
    return;
  }

  Promise.all(inputs.map(fetchPageTitle))
    .then((pageTitles) => {
      // Record on the commafield item which node the input corresponds to
      pageTitles.forEach((pageTitle, i) => {
        cf.getElementsByClassName('item')[i].dataset.nodeId = getNormalizedId(pageTitle);
      });
      // Make the network‘s start pages the pages from the inputs
      setStartPages(pageTitles);
    });

  // Show 'clear' button
  document.getElementById('clear').style.display = '';
}


// Reset the network with one or more random pages.
function goRandom() {
  const cf = document.getElementsByClassName('commafield')[0];
  getRandomArticle().then((ra) => {
    addItem(cf, decodeURIComponent(ra));
    go();
  });
}

// Reset the network with content from a JSON string
function resetNetworkFromJson(j) {
  if (!initialized) makeNetwork();
  clearNetwork();
  const obj = networkFromJson(j);
  nodes = obj.nodes;
  edges = obj.edges;
  window.startpages = obj.startpages;
  // Fill the network
  network.setData({ nodes, edges });
  // Populate the top bar
  const cf = document.getElementById('input');
  clearItems(cf);
  window.startpages.forEach((sp) => {
    console.log(sp, nodes.get(sp));
    addItem(cf, nodes.get(sp).label.replace(/\s+/g, ' '));
    // TODO: set node IDs on commafield items
    // TODO: lock commafield items that have been expanded
  });
}

// NETWORK SERIALIZE
/* global vis, nodes, edges, resetNetworkFromJson, getEdgeColor, getColor, getNormalizedId */ // eslint-disable-line max-len
// Functions for the serialization of a vis.js network. This allows for storing
// a network as JSON and then loading it back later.


// SERIALIZATION METHODS //

// Get all the edges that are not directly from a node to its parent. These
// are formed at all cases in which expanding a node links it to a pre-existing
// node.
function getFloatingEdges() {
    const floatingEdges = [];
    edges.forEach((edge) => {
      if (nodes.get(edge.to).parent !== edge.from) {
        floatingEdges.push(edge);
      }
    });
    return floatingEdges;
  }
  
  // Remove all properties from a node Object which can easily be reconstructed
  function abbreviateNode(node) {
    /* Omits the following properties:
    - node.id, which is inferred from `label` through `getNormalizedId`
    - node.color, which is inferred from `level` through `getColor`
    - node.value, which is inferred from `startpages` (included separately)
    - node.x, which doesn't matter at all for reconstruction
    - node.y, which also doesn't matter at all
  
    This leaves us with:
    - node.label, which is used to reconstruct node.id
    - node.level, which is used to reconstruct node.color
    - node.parent, which is used to reconstruct the network's edges */
  
    const newnode = { a: node.label,
      b: node.level,
      c: node.parent };
    return newnode;
  }
  
  // Remove all properties from an edge Object which can be easily reconstructed
  function abbreviateEdge(edge) {
    /* Omits the following properties:
    - edge.color, which is inferred from nodes.get(edge.to).color
    - edge.selectionWidth, which is always 2
    - edge.hoverWidth, which is always 0
    */
    const newedge = { a: edge.from,
      b: edge.to,
      c: edge.level };
    return newedge;
  }
  
  // Concisely JSON-ize the data needed to quickly reconstruct the network
  function networkToJson() {
    const out = {};
  
    // Store nodes
    const data = nodes._data; // Retreive an object representing nodes data
    const vals = Object.keys(data).map(k => data[k]);
    const abbv = vals.map(abbreviateNode); // Process it
    out.nodes = abbv; // Store it
  
    // Store startpages
    out.startpages = window.startpages;
  
    // Store floating edges
    out.edges = getFloatingEdges();
  
    return JSON.stringify(out);
  }
  
  
  // DESERIALIZATION METHODS //
  
  // Unabbreviate a node Object
  function unabbreviateNode(node, startpgs) {
    // Make quick substitutions
    const newnode = {
      label: node.a,
      level: node.b,
      parent: node.c,
    };
    // Infer omitted properties
    newnode.id = getNormalizedId(newnode.label);
    newnode.color = getColor(newnode.level);
    newnode.value = startpgs.indexOf(newnode.id) === -1 ? 1 : 2;
  
    return newnode;
  }
  
  // Unabbreviate an edge Object.
  function unabbreviateEdge(edge) {
    const newedge = { from: edge.a,
      to: edge.b,
      level: edge.c };
    newedge.color = getEdgeColor(newedge.level);
    newedge.selectionWidth = 2;
    newedge.hoverWidth = 0;
  
    return newedge;
  }
  
  // Reconstruct edges given a list of nodes
  function buildEdges(nds) {
    const edgs = new vis.DataSet();
    nds.forEach((node) => {
      if (node.parent !== node.id) {
        edgs.add({
          from: node.parent,
          to: node.id,
          color: getEdgeColor(node.level),
          level: node.level,
          selectionWidth: 2,
          hoverWidth: 0,
        });
      }
    });
  
    return edgs;
  }
  
  // Take consise JSON and use it to reconstruct `nodes` and `edges`
  function networkFromJson(data) {
    const out = {};
  
    // Store startpages
    out.startpages = data.startpages;
    // Store nodes
    const nds = data.nodes;
    const expandedNodes = nds.map(x => unabbreviateNode(x, out.startpages));
    out.nodes = new vis.DataSet();
    out.nodes.add(expandedNodes);
    // Store edges
    out.edges = buildEdges(expandedNodes);
    out.edges.add(data.edges);
  
    return out;
  }
  
  
  // MAIN FUNCTIONS
  
  function storeGraph() {
    throw new Error('storeGraph is no longer implemented.');
  }
  
  function loadGraph(id) {
    fetch(`/graphs/${id}.json`)
      .then(r => r.json())
      .then(resetNetworkFromJson);
  }
  
  
  // DEBUGGING FUNCTIONS //
  
  // Debugging function to see the number of characters saved by only including
  // select values in the JSON output. This helps me assess the efficiency of my
  // abbreviation method.
  function howConcise() {
    // Length of all the data if no abbre
    const unAbbreviatedLength = JSON.stringify(nodes._data).length +
                              JSON.stringify(edges._data).length +
                              JSON.stringify(window.startpages).length;
    const abbreviatedLength = networkToJson().length;
    const bytesSaved = unAbbreviatedLength - abbreviatedLength;
    const percentSaved = (bytesSaved / unAbbreviatedLength) * 100;
    const averageSize = abbreviatedLength / nodes.length;
    console.log(`Abbreviation takes JSON size from ${unAbbreviatedLength} bytes (unabbreviated) to ${abbreviatedLength} bytes (abbreviated)`);
    console.log(`Saves a total of ${bytesSaved} bytes (${percentSaved} percent)`);
    console.log(`Average size of ${averageSize} bytes per node`);
  }

// BINDINGS

/* global nodes, network, isTouchDevice, shepherd */
/* global expandNode, traceBack, resetProperties, go, goRandom, clearNetwork, unwrap */
// This script contains (most of) the code that binds actions to events.


// Functions that will be used as bindings
function expandEvent(params) {
    if (params.nodes.length) {
      const nodeId = params.nodes[0];
      const node = nodes.get(nodeId);
      
      // Check if the node has already been expanded
      if (node.expanded) {
        // If already expanded, open the Wikipedia page instead
        const page = encodeURIComponent(unwrap(node.label));
        const url = `http://en.wikipedia.org/wiki/${page}`;
        window.open(url, '_blank');
      } else {
        // If not expanded, expand the node
        expandNode(nodeId);
        // Mark the node as expanded
        nodes.update({ id: nodeId, expanded: true });
      }
    }
  }
  
  function mobileTraceEvent(params) { // Trace back a node (with event handler)
    if (params.nodes.length) { // Was the click on a node?
      // The node clicked
      const page = params.nodes[0];
      // Highlight in blue all nodes tracing back to central node
      traceBack(page);
    } else {
      resetProperties();
    }
  }
  
  function openPageEvent(params) {
    if (params.nodes.length) {
      const nodeid = params.nodes[0];
      const page = encodeURIComponent(unwrap(nodes.get(nodeid).label));
      const url = `http://en.wikipedia.org/wiki/${page}`;
      window.open(url, '_blank');
    }
  }
  
  function bindNetwork() {
    if (isTouchDevice) {
      // For touch devices, we'll keep the long press to expand
      network.on('hold', expandEvent);
      network.on('click', mobileTraceEvent);
    } else {
      // For non-touch devices, we'll use double-click to expand
    //   network.on('doubleClick', onNodeClick);
      network.on('click', (params) => {
        if (params.nodes.length) {
          traceBack(params.nodes[0]);
        } else {
          resetProperties();
        }
        onNodeClick(params)
      });
      network.on('hoverNode', params => traceBack(params.node));
      network.on('blurNode', resetProperties);
    }
  
    // Remove the previous double-click binding for opening Wikipedia page
    // network.off('doubleClick', openPageEvent);
  }
  
  function bind() {
    // Prevent iOS scrolling
    document.addEventListener('touchmove', e => e.preventDefault());
  
    // Bind actions for search component.
  
    const cf = document.querySelector('.commafield');
    // Bind go button press
    const submitButton = document.getElementById('submit');
    submitButton.addEventListener('click', () => {
      shepherd.cancel(); // Dismiss the tour if it is in progress
      go();
    });
  
    const randomButton = document.getElementById('random');
    randomButton.addEventListener('click', goRandom);
  
    const clearButton = document.getElementById('clear');
    clearButton.addEventListener('click', clearNetwork);
  
    // Bind tour start
    const tourbtn = document.getElementById('tourinit');
    const helpButton = document.getElementById('help');
    tourbtn.addEventListener('click', () => shepherd.start());
    helpButton.addEventListener('click', () => shepherd.start());
  
    // Bind GitHub button
    const ghbutton = document.getElementById('github');
    ghbutton.addEventListener('click', () => window.open('https://github.com/controversial/wikipedia-map', '_blank'));
  
    // Bind About button
    const aboutButton = document.getElementById('about');
    aboutButton.addEventListener('click', () => window.open('https://github.com/controversial/wikipedia-map/blob/master/README.md#usage', '_blank'));
  }

// COMMAFIELD

/* This contains the JavaScript code for the 'commafield,' which is basically
a tag input. It just gives visual feedback that inputs were 'registered' when a
user is inputting multiple elements. Running this script will transform all
elements with the 'commafield' class name to comma separated input field.
*/

// == HELPER FUNCTIONS == //

// Turn placeholder on for a commafield
function onPlaceholder(cf) {
    if (cf.hasAttribute('data-placeholder')) {
      const inp = cf.getElementsByTagName('input')[0];
      inp.setAttribute('placeholder', cf.getAttribute('data-placeholder'));
    }
  }
  
  // Turn placeholder off for a commafield
  function offPlaceholder(cf) {
    if (cf.hasAttribute('data-placeholder')) {
      const inp = cf.getElementsByTagName('input')[0];
      inp.removeAttribute('placeholder');
    }
  }
  
  // An onclick function that removes the element clicked
  function removeThis() {
    const parent = this.parentElement;
    if (!this.classList.contains('locked')) parent.removeChild(this);
    // If this was the last element, turn on the placeholder
    if (parent.getElementsByClassName('item').length === 0) {
      onPlaceholder(parent);
    }
  }
  
  // == PUBLIC API == //
  
  // Return a list of the text in each item of an element (specified by either the node or an id)
  
  function getRegisteredItems(inp) {
    // Get the element if a string id was provided
    const cf = typeof inp === 'string' ? document.getElementById(inp) : inp;
    const items = Array.from(cf.getElementsByClassName('item'));
    return items.map(i => i.textContent);
  }
  
  function getItems(inp) {
    const itemtexts = getRegisteredItems(inp);
    // Add the input box's text if anything is entered
    const cf = typeof inp === 'string' ? document.getElementById(inp) : inp;
    if (cf.getElementsByTagName('input')[0].value.trim().length) {
      itemtexts.push(cf.getElementsByTagName('input')[0].value);
    }
    return itemtexts;
  }
  
  
  // Back to inner workings
  
  // Add an item to an input
  function addItem(cf, itemtext) {
    const item = document.createElement('div');
    const text = document.createTextNode(itemtext);
    item.appendChild(text);
    item.className = 'item';
    item.onclick = removeThis;
    cf.insertBefore(item, cf.getElementsByTagName('input')[0]);
    // Turn off the placeholder
    offPlaceholder(cf);
  }
  
  // Remove the last item from a commafield
  function removeLast(cf) {
    const items = cf.querySelectorAll('.item:not(.locked)');
    if (items.length) cf.removeChild(items[items.length - 1]);
    // Turn the placeholder back on only if no tags are entered
    if (!getRegisteredItems(cf).length) onPlaceholder(cf);
  }
  
  // Locked items can only be removed by clearItems
  function lockItem(cf, idx) {
    cf.getElementsByClassName('item')[idx].classList.add('locked');
  }
  function unlockItem(cf, idx) {
    cf.getElementsByClassName('item')[idx].classList.remove('locked');
  }
  function unlockAll(cf) {
    for (let i = 0; i < cf.getElementsByClassName('item').length; i += 1) unlockItem(cf, i);
  }
  
  // Clear all items from a commafield
  function clearItems(cf) {
    // Clear input
    cf.getElementsByTagName('input')[0].value = '';
    const items = [...cf.getElementsByClassName('item')];
    items.forEach(el => cf.removeChild(el));
    onPlaceholder(cf);
  }
  
  // == Keybindings function == //
  function cfKeyDown(e = window.event) {
    // Check key codes
    const keycode = e.which || e.keyCode;
    const inp = e.target;
  
    switch (keycode) {
      // Comma was pressed. Insert comma if 'Alt' was held, otherwise continue
      case 188:
        if (e.altKey) {
          e.preventDefault(); // Don't insert a '≤'
          inp.value += ',';
          break;
        }
      // Comma (sans-Alt), Enter, or Tab was pressed.
      case 13:
      case 9:
        e.preventDefault(); // Stop normal action
        // Add item and clear input if anything besides whitespace was entered
        if (inp.value.trim().length &&
            // Prevent duplicates
            getRegisteredItems(this).indexOf(inp.value) === -1) {
          addItem(this, inp.value.trim());
          inp.value = '';
        }
        break;
      // Delete was pressed.
      case 8:
        // If we're at the beginning of text insertion, delete last item
        if (inp.value === '') {
          removeLast(this);
        }
        break;
      default:
        break;
    }
  }
  
  // == CONVERT ALL ELEMENTS WITH APPROPRIATE CLASS == //
  
  const cfs = Array.from(document.getElementsByClassName('commafield'));
  
  cfs.forEach((cf) => {
    // Create the input box
    const input = '<input class="cfinput" type="text"/>';
    cf.innerHTML = input;
  
    // If the element specified a placeholder, display that in the input.
    // Placeholder will show only if the input is blank and there are no tags
    // entered. This is designed to mimic the way a normal input works.
    onPlaceholder(cf); // Turn placeholder on (if applicable)
  
    // Bind key events
    cf.onkeydown = cfKeyDown;
  });
  
// LOADSAVED

/* global network, makeNetwork, loadGraph, Progress, Modal */
// Load a saved graph if an ID is provided in the query string

function loadSaved() {
    if (window.location.search) {
      window.progressbar = new Progress('Restoring saved graph...');
      const modalWindow = new Modal(window.progressbar.container, false);
      modalWindow.present();
      // Make the blank network
      makeNetwork();
      window.progressbar.progress(0.02);
      // Set up event listeners for the loading (starting at 2%)
      network.on('stabilizationProgress', (params) => {
        window.progressbar.progress((params.iterations / params.total) + 0.02);
      });
  
      network.once('stabilizationIterationsDone', () => { modalWindow.close(); });
      loadGraph(window.location.search.substring(1));
    }
  }

// MODALS

// Tiny library for presenting modal dialogs. Example usage:
/*
 * <div id="popup">
 *   Hello!
 * </div>

 * <script>
 *   Modal("<div>Hello!</div>").present()
 * </script>
 */

function Modal(element, clickToDismiss) {
    // Allow clicking to dismiss by default
    this.clickToDismiss = (clickToDismiss === undefined ? true : clickToDismiss);
  
    // Construct a centered floating box
    this.elem = document.createElement('div');
    if (typeof element === 'string') {
      this.elem.innerHTML = element;
    } else {
      this.elem.appendChild(element);
    }
    this.elem.className = 'centered';
  
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'modal-background transparent-blur';
  
    this.backdrop.appendChild(this.elem);
  
    // Allow dismissing the modal with a click on the background
    this.backdrop.parent = this;
    this.backdrop.addEventListener('click', (event) => {
      // Clicking on modal content won't hide it, only clicking the background will.
      if ((event.target.className.indexOf('modal-background') !== -1) && this.parent.clickToDismiss) {
        this.parent.close();
      }
    });
  
    // Expose API
  
    this.present = () => { document.body.appendChild(this.backdrop); };
    this.close = () => { document.body.removeChild(this.backdrop); };
  }

// PROGRESS

// Tiny library for progress bars. Example usage:
/*
 * <div id="progressbar">
 *   <div></div>
 * </div>

 * <script>
 *   var p_elem = document.getElementById("#progressbar")
 *   var p = new Progress(p_elem)
 *   p.progress(0.5)
 * </script>
 */

function Progress(title = '', mainclass = '', barclass = '') {
    this.container = document.createElement('div');
    // Create the progress bar
    this.elem = document.createElement('div');
    this.elem.className = `${mainclass} progressbar`;
    this.bar = document.createElement('div');
    this.bar.className = `${barclass} progressbar-indicator`;
    // Create the title
    this.title = document.createElement('h1');
    // this.title.className = "progressbar-title";
    this.title.textContent = title;
  
    // Create the label
    this.label = document.createElement('div');
    this.label.className = 'progressbar-label';
    this.label.textContent = '0';
  
    this.elem.appendChild(this.bar);
    this.container.appendChild(this.title);
    this.container.appendChild(this.elem);
    this.container.appendChild(this.label);
  
    // Start at 0%
    this.bar.style.width = '0px';
    // Function to set progress
    this.progress = (amount) => {
      if (amount !== undefined) {
        this.bar.style.width = `${amount * 100}%`;
        this.label.textContent = Math.floor(amount * 100);
        return amount;
      }
      return this.bar.offsetWidth / this.elem.offsetWidth;
    };
  }
  
  // Update UI text
document.querySelector('#input').setAttribute('data-placeholder', 'Enter a topic...');
document.querySelector('#submit').textContent = 'Explore';

// Function to show the expand menu with the expand topic button
function showExpandMenu(nodeId) {
    const menu = document.getElementById('menu');
    const expandButton = document.getElementById('expand-topic');
    expandButton.style.display = 'block';
    const topicName = document.getElementById('topic-name');
    topicName.innerText = nodeId;
    topicName.style.display = 'block';
  
    expandButton.onclick = function() {
      expandNode(nodeId);
    };
  }

  // Event handler for node click
function onNodeClick(params) {
    if (params.nodes.length) {
      const nodeId = params.nodes[0];
      showExpandMenu(nodeId);
    }
  }