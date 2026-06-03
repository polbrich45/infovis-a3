var d3; // Minor workaround to avoid error messages in editors

// Waiting until document has loaded
window.onload = () => {
  fetch("data/football.json")
    .then((response) => response.json())
    .then((json) => {
      const players = json.nodes || [];

      const pcpDimensions = [
        "appearance",
        "mins_played",
        "goals",
        "assist",
        "pass_accurate",
        "shots_total"
      ];

      const splomDimensions = [
        "appearance",
        "goals",
        "assist",
        "pass_accurate",
        "shots_total"
      ];

      const allDimensions = [...new Set([...pcpDimensions, ...splomDimensions])];

      const data = players.map((player) => {
        const row = {
          id: player.id,
          label: player.label
        };

        allDimensions.forEach((key) => {
          const value = Number(player[key]);
          row[key] = Number.isFinite(value) ? value : 0;
        });

        return row;
      });

      const allIds = data.map((d) => d.id);
      let selectedIds = new Set(allIds);

      drawPCP(data, pcpDimensions);
      drawSPLOM(data, splomDimensions);
      applySelection(allIds);

      document.addEventListener("playerSelectionChanged", (event) => {
        const ids = event.detail && Array.isArray(event.detail.ids)
          ? event.detail.ids
          : allIds;
        applySelection(ids);
      });

      function applySelection(ids) {
        selectedIds = new Set(ids);
        const showAll = selectedIds.size === data.length;

        d3.selectAll(".pcp-line")
          .classed("selected", (d) => selectedIds.has(d.id))
          .classed("unselected", (d) => !selectedIds.has(d.id));

        d3.selectAll(".splom-point")
          .classed("selected", (d) => selectedIds.has(d.id))
          .classed("unselected", (d) => !selectedIds.has(d.id));

        if (showAll) {
          d3.selectAll(".pcp-line").classed("selected", false).classed("unselected", false);
          d3.selectAll(".splom-point").classed("selected", false).classed("unselected", false);
        }
      }

      function drawPCP(dataset, dimensions) {
        const container = d3.select("#pcp-container");
        const containerNode = container.node();

        const margin = { top: 30, right: 30, bottom: 20, left: 30 };
        const width = Math.max((containerNode ? containerNode.clientWidth : 1100) - margin.left - margin.right, 900);
        const height = 420 - margin.top - margin.bottom;

        const svg = container
          .append("svg")
          .attr("width", width + margin.left + margin.right)
          .attr("height", height + margin.top + margin.bottom)
          .append("g")
          .attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scalePoint()
          .domain(dimensions)
          .range([0, width])
          .padding(0.2);

        const y = {};
        dimensions.forEach((dimension) => {
          y[dimension] = d3.scaleLinear()
            .domain(d3.extent(dataset, (d) => d[dimension]))
            .nice()
            .range([height, 0]);
        });

        const path = (d) => d3.line()(dimensions.map((dimension) => [x(dimension), y[dimension](d[dimension])]));

        svg.append("g")
          .attr("class", "pcp-lines")
          .selectAll("path")
          .data(dataset)
          .join("path")
          .attr("class", "pcp-line")
          .attr("d", path)
          .append("title")
          .text((d) => d.label);

        const axisGroups = svg.selectAll(".pcp-axis-group")
          .data(dimensions)
          .join("g")
          .attr("class", "pcp-axis-group")
          .attr("transform", (dimension) => `translate(${x(dimension)},0)`);

        axisGroups
          .append("g")
          .attr("class", "pcp-axis")
          .each(function (dimension) {
            d3.select(this).call(d3.axisLeft(y[dimension]).ticks(6));
          });

        axisGroups
          .append("text")
          .attr("class", "axis-label")
          .attr("text-anchor", "middle")
          .attr("y", -10)
          .text((dimension) => dimension);

        const activeBrushes = new Map();

        const brushY = d3.brushY()
          .extent([[-10, 0], [10, height]])
          .on("start brush end", function (event, dimension) {
            if (event.selection === null) {
              activeBrushes.delete(dimension);
            } else {
              activeBrushes.set(dimension, event.selection);
            }

            const selected = dataset.filter((player) => {
              for (const [dim, selection] of activeBrushes) {
                const yPos = y[dim](player[dim]);
                if (yPos < selection[0] || yPos > selection[1]) {
                  return false;
                }
              }
              return true;
            }).map((d) => d.id);

            const ids = activeBrushes.size > 0 ? selected : allIds;
            document.dispatchEvent(new CustomEvent("playerSelectionChanged", {
              detail: {
                source: "pcp",
                ids: ids
              }
            }));
          });

        axisGroups
          .append("g")
          .attr("class", "pcp-brush")
          .each(function () {
            d3.select(this).call(brushY);
          });
      }

      function drawSPLOM(dataset, dimensions) {
        const container = d3.select("#splom-container");

        const n = dimensions.length;
        const cellSize = 120;
        const padding = 16;
        const fullSize = cellSize * n + padding * 2;

        const cols = [...dimensions].reverse();
        const rows = [...dimensions];

        const x = {};
        const y = {};
        dimensions.forEach((dimension) => {
          x[dimension] = d3.scaleLinear()
            .domain(d3.extent(dataset, (d) => d[dimension]))
            .nice()
            .range([10, cellSize - 10]);

          y[dimension] = d3.scaleLinear()
            .domain(d3.extent(dataset, (d) => d[dimension]))
            .nice()
            .range([cellSize - 10, 10]);
        });

        const svg = container
          .append("svg")
          .attr("width", fullSize)
          .attr("height", fullSize)
          .append("g")
          .attr("transform", `translate(${padding},${padding})`);

        const cellData = d3.cross(cols, rows, (xDim, yDim) => ({ xDim, yDim }));

        const cells = svg.selectAll(".splom-cell")
          .data(cellData)
          .join("g")
          .attr("class", "splom-cell")
          .attr("transform", (d) => `translate(${cols.indexOf(d.xDim) * cellSize},${rows.indexOf(d.yDim) * cellSize})`);

        cells.append("rect")
          .attr("class", "frame")
          .attr("x", 0)
          .attr("y", 0)
          .attr("width", cellSize)
          .attr("height", cellSize);

        cells.each(function (cell) {
          const g = d3.select(this);
          if (cell.xDim === cell.yDim) {
            g.append("text")
              .attr("class", "splom-label")
              .attr("x", 10)
              .attr("y", 20)
              .text(cell.xDim);
            return;
          }

          g.selectAll("circle")
            .data(dataset)
            .join("circle")
            .attr("class", "splom-point")
            .attr("r", 2.8)
            .attr("cx", (d) => x[cell.xDim](d[cell.xDim]))
            .attr("cy", (d) => y[cell.yDim](d[cell.yDim]))
            .append("title")
            .text((d) => d.label);
        });

        let brushCell = null;

        const brush = d3.brush()
          .extent([[0, 0], [cellSize, cellSize]])
          .on("start", function () {
            if (brushCell !== this) {
              d3.select(brushCell).call(brush.move, null);
              brushCell = this;
            }
          })
          .on("brush end", function (event, cell) {
            if (!event.selection) {
              document.dispatchEvent(new CustomEvent("playerSelectionChanged", {
                detail: {
                  source: "splom",
                  ids: allIds
                }
              }));
              return;
            }

            const [[x0, y0], [x1, y1]] = event.selection;
            const selected = dataset.filter((d) => {
              const cx = x[cell.xDim](d[cell.xDim]);
              const cy = y[cell.yDim](d[cell.yDim]);
              return x0 <= cx && cx <= x1 && y0 <= cy && cy <= y1;
            }).map((d) => d.id);

            document.dispatchEvent(new CustomEvent("playerSelectionChanged", {
              detail: {
                source: "splom",
                ids: selected.length ? selected : allIds
              }
            }));
          });

        cells
          .filter((d) => d.xDim !== d.yDim)
          .append("g")
          .attr("class", "splom-brush")
          .call(brush);
      }
    })
    .catch((error) => {
      console.error("Error loading football dataset:", error);
    });
};
