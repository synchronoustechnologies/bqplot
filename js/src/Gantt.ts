/* Copyright 2015 Bloomberg Finance L.P.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as _ from 'underscore';
import * as d3 from 'd3';
import { Mark } from './Mark';
import { GanttModel } from './GanttModel'
import * as markers from './Markers';

const d3GetEvent = function(){return require("d3-selection").event}.bind(this);

const bqSymbol = markers.symbol;

export class Gantt extends Mark {
    render() {
        const base_render_promise = super.render();
        const that = this;

        this.dot = bqSymbol().size(this.model.get("marker_size"));
        if (this.model.get("marker")) {
            this.dot.type(this.model.get("marker"));
        }

        this.drag_listener = d3.drag()
            .subject(function(d: any) {
                return {
                    x: that.x_scale.scale(d.x),
                    y: that.y_scale.scale(d.y),
                };
            })
            .on("start", function(d, i) { return that.drag_start(d, i, this); })
            .on("drag", function(d, i) { return that.on_drag(d, i, this); })
            .on("end", function(d, i) { return that.drag_ended(d, i, this); });

        this.selected_style = this.model.get("selected_style");
        this.unselected_style = this.model.get("unselected_style");
        this.selected_indices = this.model.get("selected");

        this.hovered_style = this.model.get("hovered_style");
        this.unhovered_style = this.model.get("unhovered_style");
        this.hovered_index = (!this.model.get("hovered_point")) ? null : [this.model.get("hovered_point")];

        // Mabye dont need "dot"?
        this.display_el_classes = ["line", "legendtext", "dot"];
        this.event_metadata = {
            "mouse_over": {
                "msg_name": "hover",
                "lookup_data": false,
                "hit_test": true
            },
            "legend_clicked":  {
                "msg_name": "legend_click",
                "hit_test": true
            },
            "element_clicked": {
                "msg_name": "element_click",
                "lookup_data": false,
                "hit_test": true
            },
            "parent_clicked": {
                "msg_name": "background_click",
                "hit_test": false
            }
        };

        // TODO: create_listeners is put inside the promise success handler
        // because some of the functions depend on child scales being
        // created. Make sure none of the event handler functions make that
        // assumption.
        this.displayed.then(() => {
            this.parent.tooltip_div.node().appendChild(that.tooltip_div.node());
            this.create_tooltip();
        });

        return base_render_promise.then(() => {
            this.event_listeners = {};
            this.process_interactions();
            this.create_listeners();
            this.compute_view_padding();
            this.draw(false);
        });
    }

    // Drag functions
    drag_start(d, i, dragged_node) {
        // d[0] and d[1] will contain the previous position (in pixels)
        // of the dragged point, for the length of the drag event
        const x_scale = this.scales.x, y_scale = this.scales.y;
        d[0] = x_scale.scale(d.x) + x_scale.offset;
        d[1] = y_scale.scale(d.y) + y_scale.offset;

        this.set_drag_style(d, i, dragged_node)

        this.send({
            event: "drag_start",
            point: {x : d.x, y: d.y},
            index: i
        });
    }

    on_drag(d, i, dragged_node) {
        const x_scale = this.scales.x, y_scale = this.scales.y;
        // If restrict_x is true, then the move is restricted only to the X
        // direction.
        const restrict_x = this.model.get("restrict_x"),
            restrict_y = this.model.get("restrict_y");
        if (restrict_x && restrict_y) { return; }
        if (!restrict_y) { d[0] = d3GetEvent().x; }
        if (!restrict_x) { d[1] = d3GetEvent().y; }

        d3.select(dragged_node)
          .attr("transform", () => {
              return "translate(" + d[0] + "," + d[1] + ")";
          });
        this.send({
            event: "drag",
            origin: {x: d.x, y: d.y},
            point: {
                x: x_scale.invert(d[0]),
                y: y_scale.invert(d[1])
            },
            index: i
        });
        if(this.model.get("update_on_move")) {
            // saving on move if flag is set
            this.update_array(d, i);
        }
    }

    drag_ended(d, i, dragged_node) {
        const x_scale = this.scales.x;
        const y_scale = this.scales.y;

        this.reset_drag_style(d, i, dragged_node);
        this.update_array(d, i);
        this.send({
            event: "drag_end",
            point: {
                x: x_scale.invert(d[0]),
                y: y_scale.invert(d[1])
            },
            index: i
        });
    }

    update_array(d, i) {
        const x_scale = this.scales.x;
        const y_scale = this.scales.y;

        if (!this.model.get("restrict_y")){
            const x = this.model.get('x').slice(); // copy
            x[i] = x_scale.invert(d[0]);
            this.model.set("x", x);
        }
        if (!this.model.get("restrict_x")){
            const y = this.model.get('y').slice()
            y[i] = y_scale.invert(d[1]);
            this.model.set("y", y);
        }
        this.touch();
    }

    set_drag_behavior() {
        // const elements = this.d3el.selectAll(".object_grp");
        const elements = this.d3el.selectAll(".curve");
        if (this.model.get("enable_move")) {
            console.log('enable_move')
            elements.call(this.drag_listener);
        } else {
            console.log('.drag')
            elements.on(".drag", null);
        }
    }

    set_drag_style(d, i, dragged_node) {
        d3.select(dragged_node)
          .select("path")
          .classed("drag_scatter", true)
          .transition("set_drag_style")
          .attr("d", this.dot.size(5 * this.model.get("default_size")));

        const drag_color = this.model.get("drag_color");
        if (drag_color) {
            d3.select(dragged_node)
              .select("path")
              .style("fill", drag_color)
              .style("stroke", drag_color);
        }
    }

    reset_drag_style(d, i, dragged_node) {
        const stroke = this.model.get("stroke");
        const original_color = this.get_element_color(d, i);

        d3.select(dragged_node)
          .select("path")
          .classed("drag_scatter", false)
          .transition("reset_drag_style");

        if (this.model.get("drag_color")) {
            d3.select(dragged_node)
              .select("path")
              .style("fill", original_color)
              .style("stroke", stroke ? stroke : original_color);
        }
    }

    update_selected(model, value) {
        this.selected_indices = value;
        this.apply_styles();
    }

    update_hovered(model, value) {
        this.hovered_index = value === null ? value : [value];
        this.apply_styles();
    }

    // Hovered Style related functions
    hovered_style_updated(model, style) {
        this.hovered_style = style;
        this.clear_style(model.previous("hovered_style"), this.hovered_index);
        this.style_updated(style, this.hovered_index);
    }

    unhovered_style_updated(model, style) {
        this.unhovered_style = style;
        const hov_indices = this.hovered_index;
        const unhovered_indices = (hov_indices) ?
            _.range(this.model.mark_data.length).filter((index) => {
                return hov_indices.indexOf(index) === -1;
            }) : [];
        this.clear_style(model.previous("unhovered_style"), unhovered_indices);
        this.style_updated(style, unhovered_indices);
    }

    reset_selection() {
        this.model.set("selected", null);
        this.selected_indices = null;
        this.touch();
    }

    process_click(interaction) {
        super.process_click(interaction);
        switch (interaction){
            // case "add":
            //     this.event_listeners.parent_clicked = this.add_element;
            //     this.event_listeners.element_clicked = () => {};
            //     break;
            // case "delete":
            //     this.event_listeners.parent_clicked = () => {};
            //     this.event_listeners.element_clicked = this.delete_element;
            //     break;
            case "select":
                this.event_listeners.parent_clicked = this.reset_selection;
                this.event_listeners.element_clicked = this.gantt_click_handler;
                break;
        }
    }

    gantt_click_handler(args) {
        const index : number = args.index;
        const idx = this.model.get("selected") || [];
        let selected : Array<number> = Array.from(idx);
        // index of bar i. Checking if it is already present in the list.
        const elem_index = selected.indexOf(index);
        // Replacement for "Accel" modifier.
        const accelKey = d3GetEvent().ctrlKey || d3GetEvent().metaKey;

        if(elem_index > -1 && accelKey) {
            // if the index is already selected and if accel key is
            // pressed, remove the element from the list
            selected.splice(elem_index, 1);
        } else {
            if(accelKey) {
                //If accel is pressed and the bar is not already selcted
                //add the bar to the list of selected bars.
                selected.push(index);
            }
            // updating the array containing the bar indexes selected
            // and updating the style
            else {
                //if accel is not pressed, then clear the selected ones
                //and set the current element to the selected
                selected = [];
                selected.push(index);
            }
        }
        this.model.set("selected",
                       ((selected.length === 0) ? null : new Uint32Array(selected)),
                       {updated_view: this});
        this.touch();
        let e = d3GetEvent();
        if(!e) {
            e = window.event;
        }
        if(e.cancelBubble !== undefined) { // IE
            e.cancelBubble = true;
        }
        if(e.stopPropagation) {
            e.stopPropagation();
        }
        e.preventDefault();
    }

    draw_elements(animate, elements_added) {
        const animation_duration = animate === true ? this.parent.model.get("animation_duration") : 0;
        // const elements = this.d3el.selectAll(".object_grp")
        const elements = this.d3el.selectAll(".curve")

        elements_added.append("path").attr("class", "dot element");
        elements_added.append("text").attr("class", "dot_text");
        elements.select("path")
            .transition("draw_elements")
            .duration(animation_duration)
            .attr("d", this.dot);

        // this.update_names(animate);
        this.apply_styles();
    }

    // Default line functions
    set_ranges() {
        const x_scale = this.scales.x;
        const y_scale = this.scales.y;
        if(x_scale) {
            x_scale.set_range(this.parent.padded_range("x", x_scale.model));
        }
        if(y_scale) {
            y_scale.set_range(this.parent.padded_range("y", y_scale.model));
        }
    }

    set_positional_scales() {
        const x_scale = this.scales.x;
        const y_scale = this.scales.y;
        this.listenTo(x_scale, "domain_changed", function() {
            if (!this.model.dirty) {
                this.update_line_xy();
            }
        });
        this.listenTo(y_scale, "domain_changed", function() {
            if (!this.model.dirty) {
                this.update_line_xy();
            }
        });
    }

    initialize_additional_scales() {
        const color_scale = this.scales.color;
        if(color_scale) {
            this.listenTo(color_scale, "domain_changed", function() {
                this.update_style();
            });
            color_scale.on("color_scale_range_changed", this.update_style, this);
        }
    }

    create_listeners() {
        super.create_listeners();
        /*
        this.d3el.on("mouseover", _.bind(function() { this.event_dispatcher("mouse_over"); }, this))
            .on("mousemove", _.bind(function() { this.event_dispatcher("mouse_move"); }, this))
            .on("mouseout", _.bind(function() { this.event_dispatcher("mouse_out"); }, this));
        */
        this.d3el.on("mouseover", () => { this.event_dispatcher("mouse_over"); })
        this.d3el.on("mousemove", () => { this.event_dispatcher("mouse_move"); })
        this.d3el.on("mouseout", () => { this.event_dispatcher("mouse_out"); });

        this.listenTo(this.model, "change:tooltip", this.create_tooltip);

        // FIXME: multiple calls to update_path_style. Use on_some_change.
        this.listenTo(this.model, "change:interpolation", this.update_path_style);
        this.listenTo(this.model, "change:close_path", this.update_path_style);

        // FIXME: multiple calls to update_style. Use on_some_change.
        // this.listenTo(this.model, "labels_updated", this.update_labels);
        this.listenTo(this.model, "change:colors", this.update_style);
        this.listenTo(this.model, "change:opacities", this.update_style);
        this.listenTo(this.model, "change:fill_opacities", this.update_style);
        this.listenTo(this.model, "change:fill_colors", this.update_style);
        this.listenTo(this.model, "change:fill", this.update_fill);
        this.listenTo(this.model, "change:stroke_width", this.update_stroke_width);
        this.listenTo(this.model, "change:labels_visibility", this.update_legend_labels);
        this.listenTo(this.model, "change:curves_subset", this.update_curves_subset);
        this.listenTo(this.model, "change:line_style", this.update_line_style);
        this.listenTo(this.model, "change:marker", this.update_marker);
        this.listenTo(this.model, "change:marker_size", this.update_marker_size);

        // Drag & Drop
        this.listenTo(this.model, "change:enable_move", this.set_drag_behavior);
        this.listenTo(this.model, "change:selected", this.update_selected);
        this.listenTo(this.model, "change:interactions", this.process_interactions);
        this.listenTo(this.model, "change:hovered_point", this.update_hovered);
        this.listenTo(this.model, "change:hovered_style", this.hovered_style_updated);
        this.listenTo(this.model, "change:unhovered_style", this.unhovered_style_updated);

        this.listenTo(this.parent, "bg_clicked", () => {
            this.event_dispatcher("parent_clicked");
        });

        this.listenTo(this.model, "data_updated", () => {
            const animate = true;
            this.draw(animate);
        });
    }

    update_legend_labels() {
        if(this.model.get("labels_visibility") === "none") {
            this.d3el.selectAll(".legend").attr("display", "none");
            this.d3el.selectAll(".curve_label").attr("display", "none");
        } else if(this.model.get("labels_visibility") === "label") {
            this.d3el.selectAll(".legend").attr("display", "none");
            this.d3el.selectAll(".curve_label").attr("display", "inline");
        } else {
            this.d3el.selectAll(".legend").attr("display", "inline");
            this.d3el.selectAll(".curve_label").attr("display", "none");
        }
    }

    /*
    update_labels() {
        this.d3el.selectAll(".curve")
          .data(this.model.mark_data)
          .select(".curve_label")
          .text(function(d) { return d.name; });
    }
    */

    get_line_style() {
        switch (this.model.get("line_style")) {
            case "solid":
                return "none";
            case "dashed":
                return "10,10";
            case "dotted":
                return "2,10";
            case "dash_dotted":
                return "10,5,2,5";
        }
    }

    // Updating the style of the curve, stroke, colors, dashed etc...
    // Could be fused in a single function for increased readability
    // and to avoid code repetition
    update_line_style() {
        this.d3el.selectAll(".curve").select(".line")
          .style("stroke-dasharray", _.bind(this.get_line_style, this));
        if (this.legend_el) {
            this.legend_el.select("path")
              .style("stroke-dasharray", _.bind(this.get_line_style, this));
        }
    }

    update_stroke_width(model, stroke_width) {
        this.compute_view_padding();
        this.d3el.selectAll(".curve").select(".line").style("stroke-width", stroke_width);
        if (this.legend_el) {
            this.legend_el.select("path").style("stroke-width", stroke_width);
        }
    }

    update_style() {
        const that = this,
            fill = this.model.get("fill"),
            fill_color = this.model.get("fill_colors"),
            opacities = this.model.get("opacities"),
            fill_opacities = this.model.get("fill_opacities");
        // update curve colors
        const curves = this.d3el.selectAll(".curve")
        curves.select(".line")
          .style("opacity", function(d, i) { return opacities[i]; })
          .style("stroke", function(d, i) {
              return that.get_element_color(d, i) || fill_color[i];
          })
          .style("fill", function(d, i) {
              return fill === "inside" ? that.get_fill_color(d, i) : "";
          })
          .style("fill-opacity", function(d, i) {
              return fill === "inside" ? fill_opacities[i] : "";
          });
        curves.select(".area")
          .style("fill", function(d, i) { return that.get_fill_color(d, i); })
          .style("opacity", function(d, i) { return fill_opacities[i]; });
        this.update_marker_style();
        // update legend style
        if (this.legend_el){
            this.legend_el.select(".line")
              .style("stroke", function(d, i) {
                  return that.get_element_color(d, i) || fill_color[i];
              })
              .style("opacity", function(d, i) { return opacities[i]; })
              .style("fill", function(d, i) {
                  return that.model.get("fill") === "none" ?
                      "" : that.get_fill_color(d, i);
              });
            this.legend_el.select(".dot")
              .style("stroke", function(d, i) {
                  return that.get_element_color(d, i) || fill_color[i];
              })
              .style("opacity", function(d, i) { return opacities[i]; })
              .style("fill", function(d, i) {
                  return that.get_element_color(d, i) || fill_color[i];
              });
            this.legend_el.select("text")
              .style("fill", function(d, i) {
                  return that.get_element_color(d, i) || fill_color[i];
              })
              .style("opacity", function(d, i) {
                  return opacities[i];
              });
        }
        this.update_stroke_width(this.model, this.model.get("stroke_width"));
        this.update_line_style();
    }

    path_closure() {
        return this.model.get("close_path") ? "Z" : "";
    }

    update_path_style() {
        const interpolation = this.get_interpolation();
        this.line.curve(interpolation);
        this.area.curve(interpolation);
        const that = this;
        this.d3el.selectAll(".curve").select(".line")
          .attr("d", function(d) {
              return that.line(d.values) + that.path_closure();
          });
        this.d3el.selectAll(".curve").select(".area")
          .transition("update_path_style")
          .duration(0) //FIXME
          .attr("d", function(d) { return that.area(d.values); });
        if (this.legend_el) {
            this.legend_line.curve(interpolation);
            this.legend_el.selectAll("path")
              .attr("d", this.legend_line(this.legend_path_data) + this.path_closure());
        }
    }

    relayout() {
        this.set_ranges();
        this.update_line_xy(false);
    }

    selector_changed(point_selector, rect_selector) {
        if(point_selector === undefined) {
            this.model.set("selected", null);
            this.touch();
            return [];
        }
        const pixels = this.pixel_coords;
        const indices = new Uint32Array(_.range(pixels.length));
        const selected = indices.filter(index => {
            return point_selector(pixels[index]);
        });
        this.model.set("selected", selected);
        this.touch();
    }

    invert_point(pixel) {
        if(pixel === undefined) {
            this.model.set("selected", null);
            this.touch();
            return;
        }

        const index = Math.min(this.bisect(this.x_pixels, pixel), Math.max((this.x_pixels.length - 1), 0));
        this.model.set("selected", new Uint32Array([index]));
        this.touch();
    }

    update_multi_range(brush_extent) {
        const x_start = brush_extent[0];
        const x_end = brush_extent[1];

        const data = this.model.x_data[0] instanceof Array ?
            this.model.x_data[0] : this.model.x_data;
        const idx_start = this.bisect(data, x_start);
        const idx_end = Math.min(this.bisect(data, x_end),
            Math.max((data.length - 1), 0));

        this.selector_model.set("selected", [idx_start, idx_end]);
        this.selector.touch();
    }

    draw_legend(elem, x_disp, y_disp, inter_x_disp, inter_y_disp) {
        const curve_labels = this.model.get_labels();
        const legend_data = this.model.mark_data.map(function(d) {
            return {index: d.index, name: d.name, color: d.color};
        });
        this.legend_el = elem.selectAll(".legend" + this.uuid).data(legend_data);

        const that = this,
            rect_dim = inter_y_disp * 0.8,
            fill_colors = this.model.get("fill_colors"),
            opacities = this.model.get("opacities");

        this.legend_line = d3.line()
            .curve(this.get_interpolation())
            .x(function(d) { return d[0]; })
            .y(function(d) { return d[1]; });

        this.legend_path_data = [[0, rect_dim],
                                [rect_dim / 2, 0],
                                [rect_dim, rect_dim / 2]];

        const legend = this.legend_el.enter()
          .append("g")
            .attr("class", "legend" + this.uuid)
            .attr("transform", function(d, i) {
                return "translate(0, " + (i * inter_y_disp + y_disp)  + ")";
            })
            .on("mouseover", _.bind(function() {
               this.event_dispatcher("legend_mouse_over");
            }, this))
            .on("mouseout", _.bind(function() {
               this.event_dispatcher("legend_mouse_out");
            }, this))
            .on("click", _.bind(function() {
               this.event_dispatcher("legend_clicked");
            }, this));

        legend.append("path")
            .attr("class", "line")
            .attr("fill", "none")
            .attr("d", this.legend_line(this.legend_path_data) + this.path_closure())
            .style("stroke", function(d, i) {
                return that.get_element_color(d, i) || fill_colors[i];
            })
            .style("fill", function(d, i) {
                return that.model.get("fill") === "none" ?
                    "" : that.get_fill_color(d, i);
            })
            .style("opacity", function(d, i) { return opacities[i]; })
            .style("stroke-width", this.model.get("stroke_width"))
            .style("stroke-dasharray", _.bind(this.get_line_style, this));

        if (this.model.get("marker")) {
            legend.append("path")
                .attr("class", "dot")
                .attr("transform", "translate(" + rect_dim / 2 + ",0)")
                .attr("d", that.dot.size(25))
                .style("fill", function(d, i) { return that.get_element_color(d, i); });
        }

        legend.append("text")
            .attr("class", "legendtext")
            .attr("x", rect_dim * 1.2)
            .attr("y", rect_dim / 2)
            .attr("dy", "0.35em")
            .text(function(d, i) { return curve_labels[i]; })
            .style("fill", function(d, i) {
              return that.get_element_color(d, i) || fill_colors[i];
            })
            .style("opacity", function(d, i) { return opacities[i]; });

        legend.merge(this.legend_el);

        const max_length = d3.max(curve_labels, function(d: any) {
            return d.length;
        });
        this.legend_el.exit().remove();
        return [this.model.mark_data.length, max_length];
    }

    update_curves_subset() {
        const display_labels = this.model.get("labels_visibility") === "label";
        // Show a subset of the curves
        const curves_subset = this.model.get("curves_subset");
        if (curves_subset.length > 0) {
            this.d3el.selectAll(".curve")
              .attr("display", function(d, i) {
                  return curves_subset.indexOf(i) !== -1 ?
                      "inline" : "none";
              })
              .select(".curve_label")
              .attr("display", function(d, i) {
                  return (curves_subset.indexOf(i) !== -1 && display_labels) ?
                      "inline" : "none";
              });
            if (this.legend_el) {
                this.legend_el
                  .attr("display", function(d, i) {
                      return curves_subset.indexOf(i) !== -1 ?
                          "inline" : "none";
                  });
            }
            this.d3el.selectAll(".curve")

        } else { //make all curves visible
            this.d3el.selectAll(".curve")
              .attr("display", "inline")
              .select(".curve_label")
              .attr("display", function(d) {
                  return display_labels ? "inline" : "none";
              });
            if (this.legend_el) {
                this.legend_el.attr("display", "inline");
            }
        }
    }

    update_fill() {
        const fill = this.model.get("fill");
        const area = (fill === "top" || fill === "bottom" || fill === "between");

        const y_scale = this.scales.y;

        this.area.defined(function(d) { return area && d.y !== null && isFinite(y_scale.scale(d.y)); });
        if (fill == "bottom") {
            this.area.y0(this.parent.plotarea_height);
        } else if (fill == "top") {
            this.area.y0(0)
        } else if (fill == "between") {
            this.area.y0(function(d) { return y_scale.scale(d.y0) + y_scale.offset; })
        }
        const that = this;
        this.d3el.selectAll(".curve").select(".area")
          .attr("d", function(d) {
              return that.area(d.values);
          })
        this.d3el.selectAll(".curve").select(".line")
          .style("fill", function(d, i) {
              return fill === "inside" ? that.get_fill_color(d, i) : "";
          })
        // update legend fill
        if (this.legend_el) {
            this.legend_el.select("path")
                .style("fill", function(d, i) {
                    return fill === "none" ? "" : that.get_fill_color(d, i);
                }
            )
        }
    }

    get_element_color(data, index) {
        const color_scale = this.scales.color;
        if(color_scale && data.color !== undefined && data.color !== null) {
            return color_scale.scale(data.color);
        }
        return this.get_colors(index);
    }

    get_fill_color(data, index) {
        const fill_colors = this.model.get("fill_colors");
        const that = this;
        return fill_colors.length === 0 ?
            that.get_element_color(data, index) : fill_colors[index];
    }

    update_line_xy(animate) {
        const x_scale = this.scales.x, y_scale = this.scales.y;
        const animation_duration = animate === true ? this.parent.model.get("animation_duration") : 0;

        this.line
          .x(function(d) { return x_scale.scale(d.x) + x_scale.offset; })
          .y(function(d) { return y_scale.scale(d.y) + y_scale.offset; })

        const fill = this.model.get("fill");
        this.area
          .x(function(d) { return x_scale.scale(d.x) + x_scale.offset; })
          .y1(function(d) { return y_scale.scale(d.y) + y_scale.offset; })

        if (fill == "bottom") {
            this.area.y0(this.parent.plotarea_height);
        } else if (fill == "top") {
            this.area.y0(0)
        } else if (fill == "between") {
            this.area.y0(function(d) { return y_scale.scale(d.y0) + y_scale.offset; })
        }

        const that = this;
        const curves_sel = this.d3el.selectAll(".curve");

        curves_sel.select(".line")
          .transition("update_line_xy")
          .attr("d", function(d) {
              return that.line(d.values) + that.path_closure();
          })
          .duration(animation_duration);

        curves_sel.select(".area")
          .transition("update_line_xy")
          .attr("d", function(d, i) {
            return that.area(d.values);
          })
          .duration(animation_duration);


        curves_sel.select(".curve_label")
          .transition("update_line_xy")
          .attr("transform", function(d) {
              const last_xy = d.values[d.values.length - 1];
              return "translate(" + x_scale.scale(last_xy.x) +
                              "," + y_scale.scale(last_xy.y) + ")";
          })
          .duration(animation_duration);

        this.update_dots_xy(animate);
        this.x_pixels = (this.model.mark_data.length > 0) ? this.model.mark_data[0].values.map(function(el)
                                                                    { return x_scale.scale(el.x) + x_scale.offset; })
                                                          : [];
        this.y_pixels = (this.model.mark_data.length > 0) ? this.model.mark_data[0].values.map(function(el)
                                                                    { return y_scale.scale(el.y) + y_scale.offset; })
                                                          : [];
        this.pixel_coords = (this.model.mark_data.length > 0) ?
            this.model.mark_data[0].values.map(function(el) {
                return [x_scale.scale(el.x) + x_scale.offset, y_scale.scale(el.y) + y_scale.offset];
            }) : [];
    }

    get_interpolation() {
        const curve_types = {
            linear: d3.curveLinear,
            basis: d3.curveBasis,
            cardinal: d3.curveCardinal,
            monotone: d3.curveMonotoneY
        };

        return curve_types[this.model.get("interpolation")];
    }

    draw(animate?) {
        this.set_ranges();

        const curves_sel = this.d3el.selectAll(".curve").data(this.model.mark_data);
        const elements = this.d3el.selectAll(".curve").data(this.model.mark_data, (d) => {
            return d.unique_id;
        });
        const elements_added = elements.enter().append("g").attr("class", "curve")

        const y_scale = this.scales.y;

        const new_curves = curves_sel.enter().append("g").attr("class", "curve");
        new_curves.append("path")
          .attr("class", "line")
          .attr("fill", "none");
        new_curves.append("path")
          .attr("class", "area");
        new_curves.append("text")
          .attr("class", "curve_label")
          .attr("x", 3)
          .attr("dy", ".35em")
          .attr("display", this.model.get("labels_visibility") !== "label" ?
                "none" : "inline")
          .text(function(d) { return d.name; });

        const fill = this.model.get("fill"),
            area = (fill === "top" || fill === "bottom" || fill === "between");
        curves_sel.select(".line")
          .attr("id", function(d, i) { return "curve" + (i+1); })
          .on("click", _.bind(function() {
              this.event_dispatcher("element_clicked");
          }, this));

        // this.draw_dots();

        this.line = d3.line()
          .curve(this.get_interpolation())
          .defined(function(d: any) { return d.y !== null && isFinite(y_scale.scale(d.y)); });

        this.area = d3.area()
          .curve(this.get_interpolation())
          .defined(function(d: any) { return area && d.y !== null && isFinite(y_scale.scale(d.y)); });

        // Having a transition on exit is complicated. Please refer to
        // Scatter.js for detailed explanation.
        curves_sel.exit().remove();
        this.update_line_xy(animate);
        this.update_style();

        // alter the display only if a few of the curves are visible
        this.update_curves_subset();

        this.draw_elements(animate, elements_added)

        // Removed the transition on exit as it was causing issues.
        // Elements are not removed until the transition is complete and
        // hence the setting styles function doesn't behave as intended.
        // The only way to call the function after all of the elements are
        // removed is round-about and doesn't look very nice visually.
        elements.exit().remove();
    }

    /*
    draw_dots() {
        if (this.model.get("marker")) {
            const dots = this.d3el.selectAll(".curve").selectAll(".dot")
                .data(function(d, i) {
                    return d.values.map(function(e) {
                        return {x: e.x, y: e.y, sub_index: e.sub_index};
                    });
                });
            dots.enter().append("path").attr("class", "dot");
            dots.exit().remove();
        }
    }
    */

    update_dots_xy(animate) {
        if (this.model.get("marker")) {
            const x_scale = this.scales.x, y_scale = this.scales.y;
            const animation_duration = animate === true ? this.parent.model.get("animation_duration") : 0;
            const dots = this.d3el.selectAll(".curve").selectAll(".dot");

            dots.transition("update_dots_xy")
                .duration(animation_duration)
                .attr("transform", function(d) { return "translate(" + (x_scale.scale(d.x) + x_scale.offset) +
                    "," + (y_scale.scale(d.y) + y_scale.offset) + ")";
                })
                .attr("d", this.dot.size(this.model.get("marker_size"))
                .type(this.model.get("marker")));
        }
    }

    compute_view_padding() {
        //This function sets the padding for the view through the variables
        //x_padding and y_padding which are view specific paddings in pixel
        let x_padding;
        if (this.model.get("marker")) {
            const marker_padding = Math.sqrt(this.model.get("marker_size")) / 2 + 1.0;
            const line_padding = this.model.get("stroke_width") / 2.0;
            x_padding = Math.max(marker_padding, line_padding);
        } else {
            x_padding = this.model.get("stroke_width") / 2.0;
        }

        const y_padding = x_padding;
        if(x_padding !== this.x_padding || y_padding !== this.y_padding) {
            this.x_padding = x_padding;
            this.y_padding = y_padding;
            this.trigger("mark_padding_updated");
        }
    }

    update_marker_style() {
        const that = this;
        const fill_color = this.model.get("fill_colors");
        const opacities = this.model.get("opacities");
        this.d3el.selectAll(".curve").each(function(d, i) {
            const curve = d3.select(this);
            curve.selectAll(".dot")
                .style("opacity", opacities[i])
                .style("fill", that.get_element_color(d, i) || fill_color[i]);
        });
    }

    update_marker(model, marker) {
        if (marker) {
            // this.draw_dots();
            this.update_dots_xy(false);
            this.update_marker_style();
            if (this.legend_el) {
                this.legend_el.select(".dot").attr("d", this.dot.type(marker).size(25));
            }
        } else {
            this.d3el.selectAll(".dot").remove();
            if (this.legend_el) {
                this.legend_el.select(".dot").attr("d", this.dot.size(0));
            }
        }
    }

    update_marker_size(model, marker_size) {
        this.compute_view_padding();
        this.d3el.selectAll(".dot").attr("d", this.dot.size(marker_size));
    }

    clear_style(style_dict, indices?) {
    }
    
    set_default_style(indices) {
    }

    set_style_on_elements(style, indices) {
    }

    dot: any;
    legend_el: any;
    legend_line: any;
    legend_path_data: any;
    selector: any;
    selector_model: any;
    area: any;
    line: any;
    x_pixels: Array<number>;
    y_pixels: Array<number>;
    x_scale: any;
    y_scale: any;
    pixel_coords: Array<number>;
    drag_listener: any;
    hovered_index: any;
    hovered_style: any;
    unhovered_style: any;

    // Overriding super class
    model: GanttModel;
}
