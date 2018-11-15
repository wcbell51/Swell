import React from "react";
import PropTypes from "prop-types";

const Header = ({content, changeHandler}) => (
  <div style={styles}>
    <input type='checkbox' placeholder='Key' checked={content.active} onChange={(e) => changeHandler(content.id, 'active', e.target.checked)}></input>

    <input type='text' placeholder='Key' onChange={(e) => changeHandler(content.id, 'key', e.target.value)}></input>

    <input type='text' placeholder='Value' onChange={(e) => changeHandler(content.id, 'value', e.target.value)}></input>
  </div>
);

const styles = {'display' : 'flex'}

Header.propTypes = {
  content: PropTypes.object.isRequired,
  changeHandler: PropTypes.func.isRequired,
};

export default Header;